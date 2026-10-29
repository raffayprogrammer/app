"use client";

import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { InvoiceBadge } from "@/components/badges";
import { Button, EmptyState, Input, PageHeader, Select, tableCls, tdCls, thCls } from "@/components/ui";
import { invoiceBalance, paidAmount } from "@/lib/calc";
import { downloadCsv, formatDate } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { formatMoney, toRupees } from "@/lib/money";
import { useScoped } from "@/lib/store";
import type { InvoiceStatus } from "@/lib/types";

export default function InvoicesPage() {
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const look = useLookups();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | InvoiceStatus | "open">("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices
      .filter((i) => !status || (status === "open" ? i.status === "unpaid" || i.status === "partial" : i.status === status))
      .filter((i) => {
        if (!term) return true;
        const c = look.customer(i.customerId);
        const v = look.vehicle(i.vehicleId);
        return [i.number, c?.name, c?.phone, v?.plate].some((x) => x?.toLowerCase().includes(term));
      })
      .sort((a, b) => b.seq - a.seq);
  }, [invoices, q, status, look]);

  const exportCsv = () =>
    downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Invoice", "Date", "Customer", "Plate", "Parts", "Labour", "Fees", "Discount", "Tax", "Total", "Paid", "Balance", "Status"],
      ...rows.map((i) => [
        i.number, formatDate(i.issuedAt), look.customer(i.customerId)?.name ?? "", look.vehicle(i.vehicleId)?.plate ?? "",
        toRupees(i.totals.parts), toRupees(i.totals.labor), toRupees(i.totals.fees), toRupees(i.totals.discount), toRupees(i.totals.tax),
        toRupees(i.totals.total), toRupees(paidAmount(i.id, payments)), toRupees(invoiceBalance(i, payments)), i.status,
      ]),
    ]);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Invoices are created from completed job cards and are never deleted — only voided."
        actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice no., customer, plate" className="w-full sm:w-72" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
          <option value="">All statuses</option>
          <option value="open">Unpaid & part paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No invoices" text="Complete a job card, then click Create invoice." />
        ) : (
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Invoice</th><th className={thCls}>Date</th><th className={thCls}>Customer</th><th className={thCls}>Vehicle</th>
                <th className={thCls}>Status</th><th className={`${thCls} text-right`}>Total</th><th className={`${thCls} text-right`}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const bal = invoiceBalance(i, payments);
                return (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className={tdCls}><Link href={`/invoices/${i.id}`} className="font-medium text-orange-700 hover:underline">{i.number}</Link></td>
                    <td className={tdCls}>{formatDate(i.issuedAt)}</td>
                    <td className={tdCls}>{look.customer(i.customerId)?.name}</td>
                    <td className={tdCls}>{look.vehicle(i.vehicleId)?.plate}</td>
                    <td className={tdCls}><InvoiceBadge status={i.status} /></td>
                    <td className={`${tdCls} text-right`}>{formatMoney(i.totals.total)}</td>
                    <td className={`${tdCls} text-right font-medium ${bal > 0 ? "text-red-600" : "text-slate-400"}`}>{formatMoney(bal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
