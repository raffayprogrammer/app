"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Field, Input, PageHeader, Stat, tableCls, tdCls, thCls } from "@/components/ui";
import { approvedJobs, lineAmount } from "@/lib/calc";
import { downloadCsv, formatDate } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { PAYMENT_METHOD } from "@/lib/meta";
import { formatMoney, toRupees } from "@/lib/money";
import { useScoped } from "@/lib/store";
import type { PaymentMethod } from "@/lib/types";

// Local calendar date (not UTC) so "today" matches the workshop's clock.
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const PRESETS: [string, () => [Date, Date]][] = [
  ["Today", () => [new Date(), new Date()]],
  ["Yesterday", () => { const d = new Date(Date.now() - 864e5); return [d, d]; }],
  ["Last 7 days", () => [new Date(Date.now() - 6 * 864e5), new Date()]],
  ["This month", () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; }],
];

const startOf = (s: string) => new Date(`${s}T00:00:00`);
const endOf = (s: string) => new Date(`${s}T23:59:59.999`);

export default function ReportsPage() {
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const ros = useScoped("ros");
  const users = useScoped("users");
  const look = useLookups();
  const today = day(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);


  const r = useMemo(() => {
    const a = startOf(from).getTime();
    const b = endOf(to).getTime();
    const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= a && t <= b; };
    const invs = invoices.filter((i) => i.status !== "void" && inRange(i.issuedAt));
    const sum = (k: keyof (typeof invs)[number]["totals"]) => invs.reduce((s, i) => s + i.totals[k], 0);
    const pays = payments.filter((p) => inRange(p.receivedAt));
    const byMethod = new Map<PaymentMethod, number>();
    for (const p of pays) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);

    const finished = ros.filter((x) => x.completedAt && inRange(x.completedAt));
    const techs = users.filter((u) => u.role === "technician").map((u) => {
      const mine = finished.filter((x) => x.technicianId === u.id);
      let hours = 0;
      let labour = 0;
      for (const x of mine) for (const j of approvedJobs(x)) for (const l of j.lines) if (l.kind === "labor") { hours += l.qty; labour += lineAmount(l); }
      return { u, cars: mine.length, hours, labour };
    });

    const partsSold = new Map<string, { name: string; qty: number; amount: number }>();
    for (const i of invs) for (const l of i.lines) if (l.kind === "part") {
      const key = l.partId ?? l.description;
      const cur = partsSold.get(key) ?? { name: l.description, qty: 0, amount: 0 };
      partsSold.set(key, { ...cur, qty: cur.qty + l.qty, amount: cur.amount + l.amount });
    }

    return {
      invs, pays, byMethod, techs,
      topParts: [...partsSold.values()].sort((x, y) => y.amount - x.amount).slice(0, 10),
      parts: sum("parts"), labor: sum("labor"), fees: sum("fees"), discount: sum("discount"), tax: sum("tax"), total: sum("total"),
      collected: pays.reduce((s, p) => s + p.amount, 0),
    };
  }, [from, to, invoices, payments, ros, users]);

  const exportCsv = () =>
    downloadCsv(`sales-${from}-to-${to}.csv`, [
      ["Invoice", "Date", "Customer", "Plate", "Parts", "Labour", "Fees", "Discount", "Parts tax", "Services tax", "Total"],
      ...r.invs.map((i) => [
        i.number, formatDate(i.issuedAt), look.customer(i.customerId)?.name ?? "", look.vehicle(i.vehicleId)?.plate ?? "",
        toRupees(i.totals.parts), toRupees(i.totals.labor), toRupees(i.totals.fees), toRupees(i.totals.discount),
        toRupees(i.totals.partsTax), toRupees(i.totals.laborTax), toRupees(i.totals.total),
      ]),
    ]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Sales, collections and technician productivity." actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export sales</Button>} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2 pb-1">
            {PRESETS.map(([label, range]) => (
              <Button key={label} size="sm" variant="secondary" onClick={() => { const [a, b] = range(); setFrom(day(a)); setTo(day(b)); }}>{label}</Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales (incl. tax)" value={formatMoney(r.total)} hint={`${r.invs.length} invoices`} />
        <Stat label="Collected" value={formatMoney(r.collected)} hint={`${r.pays.length} payments`} />
        <Stat label="Labour sales" value={formatMoney(r.labor)} hint={`Parts ${formatMoney(r.parts)}`} />
        <Stat label="Tax collected" value={formatMoney(r.tax)} hint={r.discount ? `Discounts given ${formatMoney(r.discount)}` : "No discounts"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Collections by payment method" bodyClassName="p-0">
          {r.byMethod.size === 0 ? <EmptyState title="No payments in this period" /> : (
            <table className={tableCls}>
              <tbody>
                {[...r.byMethod].map(([m, amt]) => (
                  <tr key={m}><td className={tdCls}>{PAYMENT_METHOD[m]}</td><td className={`${tdCls} text-right font-medium`}>{formatMoney(amt)}</td></tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className={tdCls}>Total</td><td className={`${tdCls} text-right`}>{formatMoney(r.collected)}</td></tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Technician productivity" bodyClassName="p-0">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Technician</th><th className={`${thCls} text-right`}>Cars finished</th><th className={`${thCls} text-right`}>Hours billed</th><th className={`${thCls} text-right`}>Labour sold</th></tr></thead>
            <tbody>
              {r.techs.map(({ u, cars, hours, labour }) => (
                <tr key={u.id}><td className={tdCls}>{u.name}</td><td className={`${tdCls} text-right`}>{cars}</td><td className={`${tdCls} text-right`}>{hours}</td><td className={`${tdCls} text-right font-medium`}>{formatMoney(labour)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Top parts sold" className="lg:col-span-2" bodyClassName="p-0">
          {r.topParts.length === 0 ? <EmptyState title="No parts sold in this period" /> : (
            <table className={tableCls}>
              <thead><tr><th className={thCls}>Part</th><th className={`${thCls} text-right`}>Qty</th><th className={`${thCls} text-right`}>Sales</th></tr></thead>
              <tbody>
                {r.topParts.map((p) => (
                  <tr key={p.name}><td className={tdCls}>{p.name}</td><td className={`${tdCls} text-right`}>{p.qty}</td><td className={`${tdCls} text-right font-medium`}>{formatMoney(p.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
