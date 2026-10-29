import { percentOf } from "./money";
import type { Invoice, Job, Line, Paisa, Payment, RepairOrder, Totals, Workshop } from "./types";

export function lineAmount(line: Pick<Line, "qty" | "unitPrice">): Paisa {
  return Math.round(line.qty * line.unitPrice);
}

export function jobTotal(job: Job): Paisa {
  return job.lines.reduce((sum, l) => sum + lineAmount(l), 0);
}

/**
 * Totals for a set of jobs. The discount is split between parts and services in
 * proportion to their value so each tax is charged on the discounted amount.
 */
export function computeTotals(
  jobs: Job[],
  discount: Paisa,
  rates: Pick<Workshop, "partsTaxRate" | "laborTaxRate">,
): Totals {
  let parts = 0;
  let labor = 0;
  let fees = 0;
  for (const job of jobs) {
    for (const line of job.lines) {
      const amt = lineAmount(line);
      if (line.kind === "part") parts += amt;
      else if (line.kind === "labor") labor += amt;
      else fees += amt;
    }
  }
  const subtotal = parts + labor + fees;
  const disc = Math.min(Math.max(discount, 0), subtotal);
  const partsDiscount = subtotal === 0 ? 0 : Math.round((disc * parts) / subtotal);
  const servicesDiscount = disc - partsDiscount;
  const partsTax = percentOf(parts - partsDiscount, rates.partsTaxRate);
  const laborTax = percentOf(labor + fees - servicesDiscount, rates.laborTaxRate);
  const tax = partsTax + laborTax;
  return { parts, labor, fees, subtotal, discount: disc, partsTax, laborTax, tax, total: subtotal - disc + tax };
}

export const approvedJobs = (ro: RepairOrder) => ro.jobs.filter((j) => j.approval === "approved");
export const openJobs = (ro: RepairOrder) => ro.jobs.filter((j) => j.approval !== "declined");

/** What the customer would pay: approved work once work has started, otherwise everything not declined. */
export function roTotals(ro: RepairOrder, ws: Workshop): Totals {
  const jobs = ro.status === "estimate" ? openJobs(ro) : approvedJobs(ro);
  return computeTotals(jobs, ro.discount, ws);
}

export function paidAmount(invoiceId: string, payments: Payment[]): Paisa {
  return payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);
}

export function invoiceBalance(inv: Invoice, payments: Payment[]): Paisa {
  if (inv.status === "void") return 0;
  return inv.totals.total - paidAmount(inv.id, payments);
}

/** Quantity of a part sitting on approved jobs whose stock has not been taken out yet. */
export function reservedQty(partId: string, ros: RepairOrder[]): number {
  let qty = 0;
  for (const ro of ros) {
    if (ro.stockDeducted || (ro.status !== "estimate" && ro.status !== "in_progress")) continue;
    for (const job of ro.jobs) {
      if (job.approval !== "approved") continue;
      for (const line of job.lines) if (line.kind === "part" && line.partId === partId) qty += line.qty;
    }
  }
  return qty;
}

/** Sum of part quantities on approved jobs, keyed by part id. */
export function approvedPartUsage(ro: RepairOrder): Map<string, number> {
  const usage = new Map<string, number>();
  for (const job of approvedJobs(ro)) {
    for (const line of job.lines) {
      if (line.kind === "part" && line.partId) usage.set(line.partId, (usage.get(line.partId) ?? 0) + line.qty);
    }
  }
  return usage;
}
