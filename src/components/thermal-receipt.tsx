import { formatDateTime, roNumber } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/meta";
import { formatMoney } from "@/lib/money";
import type { Customer, Invoice, Payment, Vehicle, Workshop } from "@/lib/types";

/** Narrow receipt layout for 80mm / 58mm thermal printers driven by the browser. */
export function ThermalReceipt({ workshop: ws, invoice: inv, roNumberValue, customer, vehicle, payments }: {
  workshop: Workshop; invoice: Invoice; roNumberValue: number; customer?: Customer; vehicle?: Vehicle; payments: Payment[];
}) {
  const m = (p: number) => formatMoney(p, false);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const small = ws.printer.paper === "58mm";

  return (
    <div className={`font-mono leading-snug text-black ${small ? "text-[10px]" : "text-[11.5px]"}`}>
      <div className="text-center">
        <p className="text-sm font-bold">{ws.name}</p>
        {ws.address && <p>{[ws.address, ws.city].filter(Boolean).join(", ")}</p>}
        {ws.phone && <p>Tel: {ws.phone}</p>}
        {ws.ntn && <p>NTN: {ws.ntn}</p>}
        <p className="my-1 border-y border-dashed border-black py-0.5 font-bold">{inv.status === "void" ? "VOID INVOICE" : "SALES INVOICE"}</p>
      </div>
      <R l="Invoice" r={inv.number} />
      <R l="Date" r={formatDateTime(inv.issuedAt)} />
      <R l="Job card" r={roNumber(roNumberValue)} />
      {customer && <R l="Customer" r={customer.name} />}
      {vehicle && <R l="Vehicle" r={vehicle.plate} />}
      <div className="my-1 border-t border-dashed border-black" />
      {inv.lines.map((l, i) => {
        const header = i === 0 || inv.lines[i - 1].jobTitle !== l.jobTitle ? l.jobTitle : null;
        return (
          <div key={i}>
            {header && <p className="mt-1 font-bold">{header}</p>}
            <p className="pl-1">{l.description}</p>
            <R l={`  ${l.qty}${l.kind === "labor" ? "h" : ""} x ${m(l.unitPrice)}`} r={m(l.amount)} />
          </div>
        );
      })}
      <div className="my-1 border-t border-dashed border-black" />
      <R l="Parts" r={m(inv.totals.parts)} />
      <R l="Labour" r={m(inv.totals.labor)} />
      {inv.totals.fees > 0 && <R l="Other charges" r={m(inv.totals.fees)} />}
      {inv.totals.discount > 0 && <R l="Discount" r={`-${m(inv.totals.discount)}`} />}
      {inv.totals.partsTax > 0 && <R l={`Sales tax parts ${inv.partsTaxRate}%`} r={m(inv.totals.partsTax)} />}
      {inv.totals.laborTax > 0 && <R l={`Tax services ${inv.laborTaxRate}%`} r={m(inv.totals.laborTax)} />}
      <div className="my-0.5 border-t border-black" />
      <R l="TOTAL (Rs)" r={m(inv.totals.total)} b />
      {payments.map((p) => <R key={p.id} l={`Paid - ${PAYMENT_METHOD[p.method]}`} r={m(p.amount)} />)}
      {inv.status !== "void" && <R l="Balance due" r={m(inv.totals.total - paid)} b />}
      <div className="my-1 border-t border-dashed border-black" />
      {ws.printer.footer && <p className="text-center">{ws.printer.footer}</p>}
      <p className="mt-1 text-center text-[9px]">Powered by WorkshopPOS</p>
    </div>
  );
}

function R({ l, r, b }: { l: string; r: string; b?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${b ? "font-bold" : ""}`}><span>{l}</span><span className="whitespace-nowrap">{r}</span></div>
  );
}
