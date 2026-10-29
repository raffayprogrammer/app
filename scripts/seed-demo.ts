// Creates the demo workshop ("Al-Noor Auto Workshop") with 5 demo logins in Supabase.
//
//   npm run seed:demo            create it (stops if it already exists)
//   npm run seed:demo -- --reset delete the demo workshop and create it again
//
// Uses the secret key from .env.local, so run it from a trusted machine only.
// Only touches the demo workshop: other workshops are never read or changed.

import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo";
import { buildDemoData } from "../src/lib/seed";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const reset = process.argv.includes("--reset");
const demoEmails = new Set(DEMO_ACCOUNTS.map((a) => a.email));

async function run<T>(label: string, call: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function existingDemoUsers() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email && demoEmails.has(u.email));
}

async function removeDemo(userIds: string[]) {
  const profiles = await run("read profiles", admin.from("profiles").select("workshop_id").in("id", userIds));
  const workshopIds = [...new Set((profiles ?? []).map((p) => p.workshop_id as string))];
  for (const ws of workshopIds) {
    console.log(`Deleting demo workshop ${ws}…`);
    await run("unlink invoices", admin.from("repair_orders").update({ invoice_id: null }).eq("workshop_id", ws));
    for (const table of [
      "audit_log", "payments", "stock_movements", "invoice_lines", "invoices", "job_lines", "jobs", "repair_orders",
      "canned_jobs", "parts", "vehicles", "customers", "profiles", "workshops",
    ]) {
      await run(`delete ${table}`, admin.from(table).delete().eq(table === "workshops" ? "id" : "workshop_id", ws));
    }
  }
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`delete login: ${error.message}`);
  }
}

async function main() {
  const existing = await existingDemoUsers();
  if (existing.length) {
    if (!reset) {
      console.log("The demo workshop already exists. Run with --reset to delete and recreate it.");
      return;
    }
    await removeDemo(existing.map((u) => u.id));
  }

  const d = buildDemoData();
  const ws = d.workshops[0];

  // Logins first: the database ids of staff come from Supabase Auth.
  const userIds = new Map<string, string>();
  for (const u of d.users) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: DEMO_PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`create login ${u.email}: ${error?.message}`);
    userIds.set(u.id, data.user.id);
  }
  const uid = (id: string | null | undefined) => (id ? userIds.get(id) ?? null : null);

  await run("workshop", admin.from("workshops").insert({
    id: ws.id, name: ws.name, phone: ws.phone, email: ws.email, address: ws.address, city: ws.city, ntn: ws.ntn,
    labor_rate: ws.laborRate, parts_tax_rate: ws.partsTaxRate, labor_tax_rate: ws.laborTaxRate, invoice_prefix: ws.invoicePrefix,
    next_invoice_seq: ws.nextInvoiceSeq, next_ro_seq: ws.nextRoSeq, printer: ws.printer, created_at: ws.createdAt,
  }));
  await run("profiles", admin.from("profiles").insert(d.users.map((u) => ({
    id: uid(u.id), workshop_id: ws.id, name: u.name, email: u.email, role: u.role, active: u.active, created_at: u.createdAt,
  }))));
  await run("customers", admin.from("customers").insert(d.customers.map((c) => ({
    id: c.id, workshop_id: ws.id, kind: c.kind, name: c.name, phone: c.phone, email: c.email, address: c.address, ntn: c.ntn,
    notes: c.notes, created_at: c.createdAt,
  }))));
  await run("vehicles", admin.from("vehicles").insert(d.vehicles.map((v) => ({
    id: v.id, workshop_id: ws.id, customer_id: v.customerId, plate: v.plate, make: v.make, model: v.model, year: v.year,
    vin: v.vin, color: v.color, odometer: v.odometer, created_at: v.createdAt,
  }))));
  await run("parts", admin.from("parts").insert(d.parts.map((p) => ({
    id: p.id, workshop_id: ws.id, part_number: p.partNumber, name: p.name, brand: p.brand, category: p.category, location: p.location,
    cost: p.cost, price: p.price, qty_on_hand: p.qtyOnHand, min_qty: p.minQty, active: p.active, created_at: p.createdAt,
  }))));
  await run("canned jobs", admin.from("canned_jobs").insert(d.cannedJobs.map((c) => ({ id: c.id, workshop_id: ws.id, title: c.title, lines: c.lines }))));
  await run("repair orders", admin.from("repair_orders").insert(d.ros.map((r) => ({
    id: r.id, workshop_id: ws.id, number: r.number, customer_id: r.customerId, vehicle_id: r.vehicleId, status: r.status, label: r.label,
    technician_id: uid(r.technicianId), concern: r.concern, notes: r.notes, odometer_in: r.odometerIn, promised_at: r.promisedAt,
    discount: r.discount, stock_deducted: r.stockDeducted, invoice_id: null, created_by: uid(r.createdBy), created_at: r.createdAt,
    updated_at: r.updatedAt, completed_at: r.completedAt,
  }))));
  await run("jobs", admin.from("jobs").insert(d.ros.flatMap((r) => r.jobs.map((j, i) => ({
    id: j.id, workshop_id: ws.id, repair_order_id: r.id, title: j.title, approval: j.approval, done: j.done, sort_order: i,
  })))));
  await run("job lines", admin.from("job_lines").insert(d.ros.flatMap((r) => r.jobs.flatMap((j) => j.lines.map((l, i) => ({
    id: l.id, workshop_id: ws.id, job_id: j.id, kind: l.kind, description: l.description, part_id: l.partId ?? null,
    qty: l.qty, unit_price: l.unitPrice, sort_order: i,
  }))))));
  await run("invoices", admin.from("invoices").insert(d.invoices.map((i) => ({
    id: i.id, workshop_id: ws.id, seq: i.seq, number: i.number, repair_order_id: i.roId, customer_id: i.customerId, vehicle_id: i.vehicleId,
    parts_tax_rate: i.partsTaxRate, labor_tax_rate: i.laborTaxRate, parts: i.totals.parts, labor: i.totals.labor, fees: i.totals.fees,
    discount: i.totals.discount, parts_tax: i.totals.partsTax, labor_tax: i.totals.laborTax, total: i.totals.total, status: i.status,
    void_reason: i.voidReason, created_by: uid(i.createdBy), issued_at: i.issuedAt,
  }))));
  await run("invoice lines", admin.from("invoice_lines").insert(d.invoices.flatMap((i) => i.lines.map((l, n) => ({
    workshop_id: ws.id, invoice_id: i.id, job_title: l.jobTitle, kind: l.kind, description: l.description, part_id: l.partId ?? null,
    qty: l.qty, unit_price: l.unitPrice, amount: l.amount, sort_order: n,
  })))));
  for (const r of d.ros.filter((x) => x.invoiceId)) {
    await run("link invoice", admin.from("repair_orders").update({ invoice_id: r.invoiceId }).eq("id", r.id));
  }
  await run("payments", admin.from("payments").insert(d.payments.map((p) => ({
    id: p.id, workshop_id: ws.id, invoice_id: p.invoiceId, method: p.method, amount: p.amount, reference: p.reference,
    user_id: uid(p.userId), received_at: p.receivedAt,
  }))));
  await run("stock movements", admin.from("stock_movements").insert(d.movements.map((m) => ({
    id: m.id, workshop_id: ws.id, part_id: m.partId, qty: m.qty, reason: m.reason, repair_order_id: m.roId ?? null, note: m.note,
    user_id: uid(m.userId), created_at: m.createdAt,
  }))));
  await run("activity log", admin.from("audit_log").insert(d.audit.map((a) => ({
    workshop_id: ws.id, user_id: uid(a.userId), action: a.action, entity: a.entity, entity_id: a.entityId, summary: a.summary, at: a.at,
  }))));

  console.log(`Demo workshop "${ws.name}" created with ${d.customers.length} customers, ${d.parts.length} parts, ${d.ros.length} job cards.`);
  console.log(`Logins (password ${DEMO_PASSWORD}): ${DEMO_ACCOUNTS.map((a) => a.email).join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
