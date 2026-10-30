// Domain model. Mirrors the tables in supabase/migrations/0001_init.sql so the
// demo store can be swapped for Supabase without changing screens.

/** Money is always stored as integer paisa (1 rupee = 100 paisa) to avoid float errors. */
export type Paisa = number;

export type Role = "owner" | "advisor" | "cashier";

export interface PrinterSettings {
  paper: "80mm" | "58mm" | "A4";
  footer: string;
  autoPrintAfterPayment: boolean;
  baudRate: number;
}

export interface Workshop {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  ntn: string;
  /** Default labour rate per hour. */
  laborRate: Paisa;
  /** Sales tax % on parts (goods). */
  partsTaxRate: number;
  /** Tax % on labour and fees (services). Provincial tax handled later. */
  laborTaxRate: number;
  invoicePrefix: string;
  nextInvoiceSeq: number;
  nextRoSeq: number;
  printer: PrinterSettings;
  createdAt: string;
}

export interface User {
  id: string;
  workshopId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  workshopId: string;
  kind: "individual" | "company";
  name: string;
  phone: string;
  email: string;
  address: string;
  ntn: string;
  notes: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  workshopId: string;
  customerId: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  color: string;
  odometer: number | null;
  createdAt: string;
}

export interface Part {
  id: string;
  workshopId: string;
  partNumber: string;
  name: string;
  brand: string;
  category: string;
  location: string;
  cost: Paisa;
  price: Paisa;
  qtyOnHand: number;
  minQty: number;
  active: boolean;
  createdAt: string;
}

export type MovementReason = "opening" | "adjustment" | "used_on_job" | "returned_from_job";

export interface StockMovement {
  id: string;
  workshopId: string;
  partId: string;
  /** Positive = stock in, negative = stock out. */
  qty: number;
  reason: MovementReason;
  roId?: string;
  note: string;
  userId: string;
  createdAt: string;
}

export type LineKind = "labor" | "part" | "fee";

export interface Line {
  id: string;
  kind: LineKind;
  description: string;
  partId?: string;
  /** Hours for labour, units for parts and fees. */
  qty: number;
  unitPrice: Paisa;
}

export type Approval = "pending" | "approved" | "declined";

export interface Job {
  id: string;
  title: string;
  approval: Approval;
  done: boolean;
  lines: Line[];
}

export interface CannedJob {
  id: string;
  workshopId: string;
  title: string;
  lines: Omit<Line, "id">[];
}

export type RoStatus = "estimate" | "in_progress" | "completed" | "invoiced" | "closed" | "cancelled";

export type WorkLabel = "none" | "in_bay" | "waiting_parts" | "waiting_customer" | "quality_check" | "ready";

export interface RepairOrder {
  id: string;
  workshopId: string;
  number: number;
  customerId: string;
  vehicleId: string;
  status: RoStatus;
  label: WorkLabel;
  concern: string;
  notes: string;
  odometerIn: number | null;
  promisedAt: string | null;
  jobs: Job[];
  discount: Paisa;
  /** True once parts on approved jobs have been taken out of stock. */
  stockDeducted: boolean;
  invoiceId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Totals {
  parts: Paisa;
  labor: Paisa;
  fees: Paisa;
  subtotal: Paisa;
  discount: Paisa;
  partsTax: Paisa;
  laborTax: Paisa;
  tax: Paisa;
  total: Paisa;
}

export interface InvoiceLine {
  jobTitle: string;
  kind: LineKind;
  description: string;
  partId?: string;
  qty: number;
  unitPrice: Paisa;
  amount: Paisa;
}

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "void";

export interface Invoice {
  id: string;
  workshopId: string;
  seq: number;
  number: string;
  roId: string;
  customerId: string;
  vehicleId: string;
  lines: InvoiceLine[];
  partsTaxRate: number;
  laborTaxRate: number;
  totals: Totals;
  status: InvoiceStatus;
  voidReason: string;
  createdBy: string;
  issuedAt: string;
}

export type PaymentMethod = "cash" | "card" | "bank" | "jazzcash" | "easypaisa" | "other";

export interface Payment {
  id: string;
  workshopId: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: Paisa;
  reference: string;
  userId: string;
  receivedAt: string;
}

export interface InvoiceEmail {
  id: string;
  workshopId: string;
  invoiceId: string;
  toEmail: string;
  fromEmail: string;
  sentBy: string | null;
  sentAt: string;
}

export interface AuditEntry {
  id: string;
  workshopId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  at: string;
}

export interface Session {
  userId: string;
  workshopId: string;
}

export interface Data {
  workshops: Workshop[];
  users: User[];
  customers: Customer[];
  vehicles: Vehicle[];
  parts: Part[];
  movements: StockMovement[];
  cannedJobs: CannedJob[];
  ros: RepairOrder[];
  invoices: Invoice[];
  payments: Payment[];
  audit: AuditEntry[];
  invoiceEmails: InvoiceEmail[];
}
