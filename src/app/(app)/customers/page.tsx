"use client";

import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerModal } from "@/components/forms";
import { Badge, Button, EmptyState, Input, PageHeader, tableCls, tdCls, thCls } from "@/components/ui";
import { invoiceBalance } from "@/lib/calc";
import { formatDate, plateKey } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useScoped } from "@/lib/store";

export default function CustomersPage() {
  const router = useRouter();
  const customers = useScoped("customers");
  const vehicles = useScoped("vehicles");
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const ros = useScoped("ros");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pk = plateKey(term);
    return customers
      .map((c) => {
        const cars = vehicles.filter((v) => v.customerId === c.id);
        const balance = invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + invoiceBalance(i, payments), 0);
        const lastVisit = ros.filter((r) => r.customerId === c.id).map((r) => r.createdAt).sort().at(-1) ?? null;
        return { c, cars, balance, lastVisit };
      })
      .filter(({ c, cars }) =>
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone.replace(/\D/g, "").includes(term.replace(/\D/g, "") || "~") ||
        cars.some((v) => pk && plateKey(v.plate).includes(pk)),
      )
      .sort((a, b) => a.c.name.localeCompare(b.c.name));
  }, [q, customers, vehicles, invoices, payments, ros]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers`}
        actions={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> New customer</Button>}
      />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or number plate" className="mb-4 max-w-md" />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title={q ? "No customers match" : "No customers yet"} action={<Button onClick={() => setAdding(true)}>Add customer</Button>} />
        ) : (
          <table className={tableCls}>
            <thead>
              <tr><th className={thCls}>Customer</th><th className={thCls}>Phone</th><th className={thCls}>Vehicles</th><th className={thCls}>Last visit</th><th className={`${thCls} text-right`}>Balance due</th></tr>
            </thead>
            <tbody>
              {rows.map(({ c, cars, balance, lastVisit }) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/customers/${c.id}`)}>
                  <td className={tdCls}>
                    <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:text-orange-700">{c.name}</Link>
                    {c.kind === "company" && <Badge tone="blue" className="ml-2">Company</Badge>}
                  </td>
                  <td className={tdCls}>{c.phone}</td>
                  <td className={tdCls}>{cars.map((v) => v.plate).join(", ") || <span className="text-slate-400">—</span>}</td>
                  <td className={tdCls}>{formatDate(lastVisit)}</td>
                  <td className={`${tdCls} text-right font-medium ${balance > 0 ? "text-red-600" : "text-slate-400"}`}>{formatMoney(balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <CustomerModal open onClose={() => setAdding(false)} onSaved={(id) => router.push(`/customers/${id}`)} />}
    </>
  );
}
