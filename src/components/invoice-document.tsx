import { formatDateTime, roNumber } from "@/lib/format";
import { LINE_KIND, PAYMENT_METHOD } from "@/lib/meta";
import { formatMoney } from "@/lib/money";
import type { Customer, Invoice, InvoiceLine, Payment, Vehicle, Workshop } from "@/lib/types";

export interface DocumentLine extends Omit<InvoiceLine, "partId"> {
  declined?: boolean;
}

/**
 * A4 layout shared by invoices and estimates (screen preview and print).
 */
export function InvoiceDocument({
  kind, number, date, workshop, customer, vehicle, roNumberValue, odometer, concern, lines, totals, partsTaxRate, laborTaxRate,
  payments = [], status, voidReason,
}: {
  kind: "invoice" | "estimate" | "jobcard";
  number: string;
  date: string;
  workshop: Workshop;
  customer?: Customer;
  vehicle?: Vehicle;
  roNumberValue: number;
  odometer?: number | null;
  concern?: string;
  lines: DocumentLine[];
  totals: Invoice["totals"];
  partsTaxRate: number;
  laborTaxRate: number;
  payments?: Payment[];
  status?: Invoice["status"];
  voidReason?: string;
}) {
  const jobs: { title: string; declined?: boolean; lines: DocumentLine[] }[] = [];
  for (const l of lines) {
    const last = jobs.at(-1);
    if (last && last.title === l.jobTitle && last.declined === l.declined) last.lines.push(l);
    else jobs.push({ title: l.jobTitle, declined: l.declined, lines: [l] });
  }
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const title = kind === "invoice" ? "Sales Invoice" : kind === "estimate" ? "Estimate" : "Job Card";

  return (
    <div className="relative bg-white text-[13px] text-slate-800">
      {status === "void" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-20deg] text-8xl font-black text-red-200">VOID</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-xl font-bold text-slate-900">{workshop.name}</p>
          <p className="text-slate-600">{[workshop.address, workshop.city].filter(Boolean).join(", ")}</p>
          <p className="text-slate-600">{[workshop.phone, workshop.email].filter(Boolean).join(" · ")}</p>
          {workshop.ntn && <p className="text-slate-600">NTN: {workshop.ntn}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-wide text-orange-600">{title}</p>
          <p className="font-semibold">{number}</p>
          <p className="text-slate-600">{formatDateTime(date)}</p>
          <p className="text-slate-600">{roNumber(roNumberValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</p>
          <p className="font-semibold">{customer?.name}</p>
          <p className="text-slate-600">{customer?.phone}</p>
          {customer?.address && <p className="text-slate-600">{customer.address}</p>}
          {customer?.ntn && <p className="text-slate-600">NTN: {customer.ntn}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vehicle</p>
          <p className="font-semibold">{vehicle?.plate}</p>
          <p className="text-slate-600">{vehicle?.make} {vehicle?.model} {vehicle?.year}</p>
          {odometer != null && <p className="text-slate-600">Odometer: {odometer.toLocaleString()} km</p>}
          {vehicle?.vin && <p className="text-slate-600">VIN: {vehicle.vin}</p>}
        </div>
      </div>
      {concern && <p className="mb-3 rounded bg-slate-50 px-3 py-2"><b>Customer complaint:</b> {concern}</p>}

      <table className="w-full">
        <thead>
          <tr className="border-y border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Description</th><th className="py-2">Type</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j, idx) => (
            <JobRows key={idx} title={j.title} declined={j.declined} lines={j.lines} />
          ))}
          {lines.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">No work added.</td></tr>}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-72 space-y-1">
          <Row label="Parts" value={formatMoney(totals.parts)} />
          <Row label="Labour" value={formatMoney(totals.labor)} />
          {totals.fees > 0 && <Row label="Other charges" value={formatMoney(totals.fees)} />}
          {totals.discount > 0 && <Row label="Discount" value={`-${formatMoney(totals.discount)}`} />}
          <Row label={`Sales tax on parts (${partsTaxRate}%)`} value={formatMoney(totals.partsTax)} />
          {laborTaxRate > 0 && <Row label={`Tax on services (${laborTaxRate}%)`} value={formatMoney(totals.laborTax)} />}
          <div className="flex justify-between border-t-2 border-slate-900 pt-1.5 text-base font-bold">
            <span>Total</span><span>{formatMoney(totals.total)}</span>
          </div>
          {kind === "invoice" && status !== "void" && (
            <>
              {payments.map((p) => <Row key={p.id} label={`Paid · ${PAYMENT_METHOD[p.method]}`} value={formatMoney(p.amount)} />)}
              <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatMoney(totals.total - paid)}</span></div>
            </>
          )}
        </div>
      </div>

      {status === "void" && voidReason && <p className="mt-4 text-red-600">Voided: {voidReason}</p>}
      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-slate-500">
        {kind === "invoice" ? (
          <p>{workshop.printer.footer}</p>
        ) : (
          <p>This {kind === "estimate" ? "estimate" : "job card"} is valid for 7 days. Prices of parts may change. Declined work is shown for your records and is not charged.</p>
        )}
        <div className="border-t border-slate-300 pt-1 text-center">Customer signature</div>
      </div>
    </div>
  );
}

function JobRows({ title, declined, lines }: { title: string; declined?: boolean; lines: DocumentLine[] }) {
  return (
    <>
      <tr className={declined ? "text-slate-400" : ""}>
        <td colSpan={5} className="pt-3 font-semibold">
          {title} {declined && <span className="ml-1 text-xs font-normal">(declined — not charged)</span>}
        </td>
      </tr>
      {lines.map((l, i) => (
        <tr key={i} className={`border-b border-slate-100 ${declined ? "text-slate-400 line-through" : ""}`}>
          <td className="py-1.5 pl-3">{l.description}</td>
          <td className="py-1.5 text-slate-500">{LINE_KIND[l.kind]}</td>
          <td className="py-1.5 text-right">{l.qty}{l.kind === "labor" ? " h" : ""}</td>
          <td className="py-1.5 text-right">{formatMoney(l.unitPrice, false)}</td>
          <td className="py-1.5 text-right">{formatMoney(l.amount, false)}</td>
        </tr>
      ))}
    </>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between"><span className="text-slate-500">{label}</span><span>{value}</span></div>
);
