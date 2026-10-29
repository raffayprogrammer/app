// Reads a workshop's data from Supabase and maps database rows (snake_case)
// to the app's domain types (camelCase). Row-level security decides what
// each signed-in user can see; tables they can't read simply come back empty.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Approval, AuditEntry, CannedJob, Customer, Data, Invoice, InvoiceStatus, Job, Line, LineKind, MovementReason, Part,
  Payment, PaymentMethod, PrinterSettings, RepairOrder, Role, RoStatus, StockMovement, User, Vehicle, WorkLabel, Workshop,
} from "../types";

type Num = number | string;
const n = (v: Num | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
const nOrNull = (v: Num | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

interface WorkshopRow {
  id: string; name: string; phone: string; email: string; address: string; city: string; ntn: string;
  labor_rate: Num; parts_tax_rate: Num; labor_tax_rate: Num; invoice_prefix: string;
  next_invoice_seq: number; next_ro_seq: number; printer: Partial<PrinterSettings> | null; created_at: string;
}
interface ProfileRow { id: string; workshop_id: string; name: string; email: string; role: Role; active: boolean; created_at: string }
interface CustomerRow {
  id: string; workshop_id: string; kind: Customer["kind"]; name: string; phone: string; email: string; address: string;
  ntn: string; notes: string; created_at: string;
}
interface VehicleRow {
  id: string; workshop_id: string; customer_id: string; plate: string; make: string; model: string; year: string;
  vin: string; color: string; odometer: number | null; created_at: string;
}
interface PartRow {
  id: string; workshop_id: string; part_number: string; name: string; brand: string; category: string; location: string;
  cost: Num; price: Num; qty_on_hand: Num; min_qty: Num; active: boolean; created_at: string;
}
interface MovementRow {
  id: string; workshop_id: string; part_id: string; qty: Num; reason: MovementReason; repair_order_id: string | null;
  note: string; user_id: string; created_at: string;
}
interface CannedRow { id: string; workshop_id: string; title: string; lines: CannedJob["lines"] }
interface RoRow {
  id: string; workshop_id: string; number: number; customer_id: string; vehicle_id: string; status: RoStatus; label: WorkLabel;
  technician_id: string | null; concern: string; notes: string; odometer_in: number | null; promised_at: string | null;
  discount: Num; stock_deducted: boolean; invoice_id: string | null; created_by: string; created_at: string;
  updated_at: string; completed_at: string | null;
}
interface JobRow { id: string; repair_order_id: string; title: string; approval: Approval; done: boolean; sort_order: number }
interface LineRow {
  id: string; job_id: string; kind: LineKind; description: string; part_id: string | null; qty: Num; unit_price: Num; sort_order: number;
}
interface InvoiceRow {
  id: string; workshop_id: string; seq: number; number: string; repair_order_id: string; customer_id: string; vehicle_id: string;
  parts_tax_rate: Num; labor_tax_rate: Num; parts: Num; labor: Num; fees: Num; discount: Num; parts_tax: Num; labor_tax: Num;
  total: Num; status: InvoiceStatus; void_reason: string; created_by: string; issued_at: string;
}
interface InvoiceLineRow {
  id: string; invoice_id: string; job_title: string; kind: LineKind; description: string; part_id: string | null;
  qty: Num; unit_price: Num; amount: Num; sort_order: number;
}
interface PaymentRow {
  id: string; workshop_id: string; invoice_id: string; method: PaymentMethod; amount: Num; reference: string; user_id: string; received_at: string;
}
interface AuditRow {
  id: string; workshop_id: string; user_id: string | null; action: string; entity: string; entity_id: string | null; summary: string; at: string;
}

const DEFAULT_PRINTER: PrinterSettings = { paper: "80mm", footer: "Thank you for your visit!", autoPrintAfterPayment: false, baudRate: 9600 };

/** Read every row of a table, 1000 at a time (the API's page limit). */
async function fetchAll<T>(sb: SupabaseClient, table: string, order: string): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select("*").order(order).order("id").range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (data.length < page) return out;
  }
}

export async function loadWorkshopData(sb: SupabaseClient): Promise<Data> {
  const [
    workshops, profiles, customers, vehicles, parts, movements, canned, ros, jobs, lines, invoices, invoiceLines, payments, audit,
  ] = await Promise.all([
    fetchAll<WorkshopRow>(sb, "workshops", "created_at"),
    fetchAll<ProfileRow>(sb, "profiles", "created_at"),
    fetchAll<CustomerRow>(sb, "customers", "created_at"),
    fetchAll<VehicleRow>(sb, "vehicles", "created_at"),
    fetchAll<PartRow>(sb, "parts", "created_at"),
    fetchAll<MovementRow>(sb, "stock_movements", "created_at"),
    fetchAll<CannedRow>(sb, "canned_jobs", "title"),
    fetchAll<RoRow>(sb, "repair_orders", "created_at"),
    fetchAll<JobRow>(sb, "jobs", "sort_order"),
    fetchAll<LineRow>(sb, "job_lines", "sort_order"),
    fetchAll<InvoiceRow>(sb, "invoices", "seq"),
    fetchAll<InvoiceLineRow>(sb, "invoice_lines", "sort_order"),
    fetchAll<PaymentRow>(sb, "payments", "received_at"),
    fetchAll<AuditRow>(sb, "audit_log", "at"),
  ]);

  const linesByJob = new Map<string, Line[]>();
  for (const l of lines) {
    const list = linesByJob.get(l.job_id) ?? [];
    list.push({ id: l.id, kind: l.kind, description: l.description, partId: l.part_id ?? undefined, qty: n(l.qty), unitPrice: n(l.unit_price) });
    linesByJob.set(l.job_id, list);
  }
  const jobsByRo = new Map<string, Job[]>();
  for (const j of jobs) {
    const list = jobsByRo.get(j.repair_order_id) ?? [];
    list.push({ id: j.id, title: j.title, approval: j.approval, done: j.done, lines: linesByJob.get(j.id) ?? [] });
    jobsByRo.set(j.repair_order_id, list);
  }
  const linesByInvoice = new Map<string, Invoice["lines"]>();
  for (const l of invoiceLines) {
    const list = linesByInvoice.get(l.invoice_id) ?? [];
    list.push({
      jobTitle: l.job_title, kind: l.kind, description: l.description, partId: l.part_id ?? undefined,
      qty: n(l.qty), unitPrice: n(l.unit_price), amount: n(l.amount),
    });
    linesByInvoice.set(l.invoice_id, list);
  }

  return {
    workshops: workshops.map((w): Workshop => ({
      id: w.id, name: w.name, phone: w.phone, email: w.email, address: w.address, city: w.city, ntn: w.ntn,
      laborRate: n(w.labor_rate), partsTaxRate: n(w.parts_tax_rate), laborTaxRate: n(w.labor_tax_rate),
      invoicePrefix: w.invoice_prefix, nextInvoiceSeq: w.next_invoice_seq, nextRoSeq: w.next_ro_seq,
      printer: { ...DEFAULT_PRINTER, ...(w.printer ?? {}) }, createdAt: w.created_at,
    })),
    users: profiles.map((p): User => ({
      id: p.id, workshopId: p.workshop_id, name: p.name, email: p.email, role: p.role, active: p.active, createdAt: p.created_at,
    })),
    customers: customers.map((c): Customer => ({
      id: c.id, workshopId: c.workshop_id, kind: c.kind, name: c.name, phone: c.phone, email: c.email, address: c.address,
      ntn: c.ntn, notes: c.notes, createdAt: c.created_at,
    })),
    vehicles: vehicles.map((v): Vehicle => ({
      id: v.id, workshopId: v.workshop_id, customerId: v.customer_id, plate: v.plate, make: v.make, model: v.model, year: v.year,
      vin: v.vin, color: v.color, odometer: nOrNull(v.odometer), createdAt: v.created_at,
    })),
    parts: parts.map((p): Part => ({
      id: p.id, workshopId: p.workshop_id, partNumber: p.part_number, name: p.name, brand: p.brand, category: p.category,
      location: p.location, cost: n(p.cost), price: n(p.price), qtyOnHand: n(p.qty_on_hand), minQty: n(p.min_qty),
      active: p.active, createdAt: p.created_at,
    })),
    movements: movements.map((m): StockMovement => ({
      id: m.id, workshopId: m.workshop_id, partId: m.part_id, qty: n(m.qty), reason: m.reason, roId: m.repair_order_id ?? undefined,
      note: m.note, userId: m.user_id, createdAt: m.created_at,
    })),
    cannedJobs: canned.map((c): CannedJob => ({ id: c.id, workshopId: c.workshop_id, title: c.title, lines: c.lines ?? [] })),
    ros: ros.map((r): RepairOrder => ({
      id: r.id, workshopId: r.workshop_id, number: r.number, customerId: r.customer_id, vehicleId: r.vehicle_id, status: r.status,
      label: r.label, technicianId: r.technician_id, concern: r.concern, notes: r.notes, odometerIn: nOrNull(r.odometer_in),
      promisedAt: r.promised_at, jobs: jobsByRo.get(r.id) ?? [], discount: n(r.discount), stockDeducted: r.stock_deducted,
      invoiceId: r.invoice_id, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
    })),
    invoices: invoices.map((i): Invoice => {
      const parts = n(i.parts), labor = n(i.labor), fees = n(i.fees), partsTax = n(i.parts_tax), laborTax = n(i.labor_tax);
      return {
        id: i.id, workshopId: i.workshop_id, seq: i.seq, number: i.number, roId: i.repair_order_id, customerId: i.customer_id,
        vehicleId: i.vehicle_id, lines: linesByInvoice.get(i.id) ?? [], partsTaxRate: n(i.parts_tax_rate), laborTaxRate: n(i.labor_tax_rate),
        totals: { parts, labor, fees, subtotal: parts + labor + fees, discount: n(i.discount), partsTax, laborTax, tax: partsTax + laborTax, total: n(i.total) },
        status: i.status, voidReason: i.void_reason, createdBy: i.created_by, issuedAt: i.issued_at,
      };
    }),
    payments: payments.map((p): Payment => ({
      id: p.id, workshopId: p.workshop_id, invoiceId: p.invoice_id, method: p.method, amount: n(p.amount), reference: p.reference,
      userId: p.user_id, receivedAt: p.received_at,
    })),
    audit: audit.map((a): AuditEntry => ({
      id: a.id, workshopId: a.workshop_id, userId: a.user_id ?? "", action: a.action, entity: a.entity, entityId: a.entity_id ?? "",
      summary: a.summary, at: a.at,
    })),
  };
}

export const EMPTY_DATA: Data = {
  workshops: [], users: [], customers: [], vehicles: [], parts: [], movements: [], cannedJobs: [], ros: [], invoices: [], payments: [], audit: [],
};
