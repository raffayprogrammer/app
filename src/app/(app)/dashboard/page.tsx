"use client";

import { AlertTriangle, Banknote, Car, ClipboardCheck, PackageX, Receipt } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { RoStatusBadge, WorkLabelBadge } from "@/components/badges";
import { Card, EmptyState, PageHeader, Stat, tableCls, tdCls, thCls } from "@/components/ui";
import { invoiceBalance, roTotals } from "@/lib/calc";
import { formatTime, isSameDay, roNumber } from "@/lib/format";
import { useLookups, useStock } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { useAuthed, useScoped } from "@/lib/store";

const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

export default function DashboardPage() {
  const { user, workshop } = useAuthed();
  const ros = useScoped("ros");
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const stock = useStock();
  const look = useLookups();

  const d = useMemo(() => {
    const today = new Date();
    const inShop = ros.filter((r) => ["estimate", "in_progress", "completed", "invoiced"].includes(r.status));
    const todaysInvoices = invoices.filter((i) => i.status !== "void" && isSameDay(i.issuedAt, today));
    const collected = payments.filter((p) => isSameDay(p.receivedAt, today)).reduce((s, p) => s + p.amount, 0);
    const unpaid = invoices.filter((i) => i.status === "unpaid" || i.status === "partial");
    return {
      inShop,
      sales: todaysInvoices.reduce((s, i) => s + i.totals.total, 0),
      salesCount: todaysInvoices.length,
      collected,
      outstanding: unpaid.reduce((s, i) => s + invoiceBalance(i, payments), 0),
      unpaid,
      awaitingApproval: ros.filter((r) => r.status === "estimate" && r.jobs.some((j) => j.approval === "pending")),
      awaitingInvoice: ros.filter((r) => r.status === "completed"),
      waitingParts: ros.filter((r) => r.status === "in_progress" && r.label === "waiting_parts"),
      low: stock.filter((p) => p.low),
    };
  }, [ros, invoices, payments, stock]);

  const attention = [
    ...d.awaitingInvoice.map((r) => ({ r, why: "Work done — create invoice" })),
    ...d.awaitingApproval.map((r) => ({ r, why: "Waiting for customer approval" })),
    ...d.waitingParts.map((r) => ({ r, why: "Waiting on parts" })),
  ];

  return (
    <>
      <PageHeader title={`${greeting(new Date().getHours())}, ${user.name.split(" ")[0]}`} subtitle={`${workshop.name} · today at a glance`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cars in workshop" value={d.inShop.length} hint={`${d.awaitingApproval.length} waiting for approval`} icon={<Car className="h-4 w-4" />} tone="blue" />
        <Stat label="Sales today" value={formatMoney(d.sales)} hint={`${d.salesCount} invoice${d.salesCount === 1 ? "" : "s"}`} icon={<Receipt className="h-4 w-4" />} tone="orange" />
        <Stat label="Collected today" value={formatMoney(d.collected)} hint="All payment methods" icon={<Banknote className="h-4 w-4" />} tone="green" />
        <Stat label="Outstanding" value={formatMoney(d.outstanding)} hint={`${d.unpaid.length} unpaid invoice${d.unpaid.length === 1 ? "" : "s"}`} icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Needs attention" className="xl:col-span-2" bodyClassName="p-0" actions={<Link href="/board" className="text-sm font-medium text-orange-700 hover:underline">Open Job Board</Link>}>
          {attention.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="h-8 w-8" />} title="All caught up" text="Nothing waiting on you right now." />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr><th className={thCls}>Job card</th><th className={thCls}>Vehicle</th><th className={thCls}>Customer</th><th className={thCls}>Status</th><th className={`${thCls} text-right`}>Amount</th></tr>
                </thead>
                <tbody>
                  {attention.map(({ r, why }) => {
                    const v = look.vehicle(r.vehicleId);
                    return (
                      <tr key={r.id + why} className="hover:bg-slate-50">
                        <td className={tdCls}>
                          <Link href={`/repair-orders/${r.id}`} className="font-medium text-orange-700 hover:underline">{roNumber(r.number)}</Link>
                          <p className="text-xs text-slate-500">{why}</p>
                        </td>
                        <td className={tdCls}><span className="font-medium">{v?.plate}</span><p className="text-xs text-slate-500">{v?.make} {v?.model}</p></td>
                        <td className={tdCls}>{look.customer(r.customerId)?.name}</td>
                        <td className={tdCls}><div className="flex flex-wrap gap-1"><RoStatusBadge status={r.status} /><WorkLabelBadge label={r.label} /></div></td>
                        <td className={`${tdCls} text-right font-medium`}>{formatMoney(roTotals(r, workshop).total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Low stock" bodyClassName="p-0" actions={<Link href="/inventory?filter=low" className="text-sm font-medium text-orange-700 hover:underline">Inventory</Link>}>
          {d.low.length === 0 ? (
            <EmptyState icon={<PackageX className="h-8 w-8" />} title="Stock looks healthy" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.low.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link href={`/inventory/${p.id}`} className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 hover:text-orange-700">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.partNumber} · bin {p.location || "—"}</p>
                  </Link>
                  <span className={`ml-3 text-sm font-semibold ${p.available <= 0 ? "text-red-600" : "text-amber-600"}`}>
                    {p.available} <span className="text-xs font-normal text-slate-400">/ min {p.minQty}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Unpaid invoices" className="mt-6" bodyClassName="p-0" actions={<Link href="/invoices" className="text-sm font-medium text-orange-700 hover:underline">All invoices</Link>}>
        {d.unpaid.length === 0 ? (
          <EmptyState title="No unpaid invoices" />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th className={thCls}>Invoice</th><th className={thCls}>Customer</th><th className={thCls}>Issued</th><th className={`${thCls} text-right`}>Total</th><th className={`${thCls} text-right`}>Balance</th></tr></thead>
              <tbody>
                {d.unpaid.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className={tdCls}><Link href={`/invoices/${i.id}`} className="font-medium text-orange-700 hover:underline">{i.number}</Link></td>
                    <td className={tdCls}>{look.customer(i.customerId)?.name}</td>
                    <td className={tdCls}>{new Date(i.issuedAt).toLocaleDateString("en-GB")} {formatTime(i.issuedAt)}</td>
                    <td className={`${tdCls} text-right`}>{formatMoney(i.totals.total)}</td>
                    <td className={`${tdCls} text-right font-semibold text-red-600`}>{formatMoney(invoiceBalance(i, payments))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
