import type { Paisa } from "./types";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Rupees (as typed by a user) to integer paisa. */
export function toPaisa(rupees: number | string): Paisa {
  const n = typeof rupees === "string" ? Number(rupees.replace(/,/g, "")) : rupees;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Integer paisa to rupees, for form inputs. */
export function toRupees(paisa: Paisa): number {
  return paisa / 100;
}

export function formatMoney(paisa: Paisa, withSymbol = true): string {
  const sign = paisa < 0 ? "-" : "";
  const body = grouped.format(Math.abs(paisa) / 100);
  return withSymbol ? `${sign}Rs ${body}` : `${sign}${body}`;
}

/** Percentage of an amount, rounded to the nearest paisa. */
export function percentOf(amount: Paisa, rate: number): Paisa {
  return Math.round((amount * rate) / 100);
}
