import type { Approval, InvoiceStatus, LineKind, PaymentMethod, RoStatus, WorkLabel } from "./types";

export type Tone = "slate" | "blue" | "amber" | "green" | "red" | "violet" | "orange";

export const RO_STATUS: Record<RoStatus, { label: string; tone: Tone }> = {
  estimate: { label: "Estimate", tone: "violet" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Work done", tone: "amber" },
  invoiced: { label: "Invoiced", tone: "orange" },
  closed: { label: "Paid & closed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const WORK_LABEL: Record<WorkLabel, { label: string; tone: Tone }> = {
  none: { label: "No label", tone: "slate" },
  in_bay: { label: "In bay", tone: "blue" },
  waiting_parts: { label: "Waiting on parts", tone: "amber" },
  waiting_customer: { label: "Waiting on customer", tone: "violet" },
  quality_check: { label: "Quality check", tone: "orange" },
  ready: { label: "Ready for pickup", tone: "green" },
};

export const APPROVAL: Record<Approval, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "red" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  unpaid: { label: "Unpaid", tone: "red" },
  partial: { label: "Part paid", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  void: { label: "Void", tone: "slate" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  other: "Other",
};

export const LINE_KIND: Record<LineKind, string> = {
  labor: "Labour",
  part: "Part",
  fee: "Fee",
};
