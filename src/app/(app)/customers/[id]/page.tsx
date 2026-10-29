"use client";

import { ArrowLeft, Car, Mail, MapPin, Pencil, Phone, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { InvoiceBadge, RoStatusBadge } from "@/components/badges";
import { CustomerModal, VehicleModal } from "@/components/forms";
import { Badge, Button, Card, EmptyState, Stat, Tabs, tableCls, tdCls, thCls } from "@/components/ui";
import { invoiceBalance, roTotals } from "@/lib/calc";
import { formatDate, roNumber } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { useAuthed, useScoped } from "@/lib/store";
import type { Vehicle } from "@/lib/types";

type Tab = "jobs" | "invoices" | "declined";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { user, workshop } = useAuthed();
  const customers = useScoped("customers");
  const vehicles = useScoped("vehicles");
  const ros = useScoped("ros");
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const [tab, setTab] = useState<Tab>("jobs");
  const [modal, setModal] = useState<null | "edit" | "vehicle" | Vehicle>(null);

  const customer = customers.find((c) => c.id === id);
  const cars = vehicles.filter((v) => v.customerId === id);
  const history = useMemo(() => ros.filter((r) => r.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [ros, id]);
  const invs = useMemo(() => invoices.filter((i) => i.customerId === id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [invoices, id]);
  // Work the customer said no to — worth offering again on the next visit.
  const declined = useMemo(
    () => history.filter((r) => r.status !== "cancelled").flatMap((r) => r.jobs.filter((j) => j.approval === "declined").map((j) => ({ r, j }))),
    [history],
  );

  if (!customer) return <EmptyState title="Customer not found" action={<Link href="/customers"><Button variant="secondary">All customers</Button></Link>} />;

  const balance = invs.reduce((s, i) => s + invoiceBalance(i, payments), 0);
  const spent = invs.filter((i) => i.status !== "void").reduce((s, i) => s + i.totals.total, 0);
  const plate = (vId: string) => vehicles.find((v) => v.id === vId)?.plate;

  return (
    <>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Customers</Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Customer" actions={<Button size="sm" variant="ghost" onClick={() => setModal("edit")}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}>
            <p className="text-lg font-semibold text-slate-900">{customer.name}</p>
            {customer.kind === "company" && <Badge tone="blue" className="mt-1">Company{customer.ntn ? ` · NTN ${customer.ntn}` : ""}</Badge>}
            <div className="mt-3 space-y-1.5 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> {customer.phone}</p>
              {customer.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> {customer.email}</p>}
              {customer.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /> {customer.address}</p>}
            </div>
            {customer.notes && <p className="mt-3 rounded bg-amber-50 px-2 py-1.5 text-sm text-amber-800">{customer.notes}</p>}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Balance due" value={<span className={balance > 0 ? "text-red-600" : ""}>{formatMoney(balance)}</span>} />
            <Stat label="Total spent" value={formatMoney(spent)} hint={`${history.length} visits`} />
          </div>
          <Card title="Vehicles" actions={<Button size="sm" variant="secondary" onClick={() => setModal("vehicle")}><Plus className="h-3.5 w-3.5" /> Add</Button>} bodyClassName="p-0">
            {cars.length === 0 ? (
              <EmptyState icon={<Car className="h-7 w-7" />} title="No vehicles yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {cars.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <button className="min-w-0 text-left" onClick={() => setModal(v)}>
                      <p className="font-semibold text-slate-900">{v.plate}</p>
                      <p className="truncate text-sm text-slate-600">{v.make} {v.model} {v.year}</p>
                      {v.odometer !== null && <p className="text-xs text-slate-400">{v.odometer.toLocaleString()} km</p>}
                    </button>
                    {can(user.role, "repair_orders") && (
                      <Link href={`/repair-orders/new?customerId=${customer.id}&vehicleId=${v.id}`}>
                        <Button size="sm" variant="secondary"><Wrench className="h-3.5 w-3.5" /> Job card</Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "jobs", label: `Service history (${history.length})` },
              { id: "invoices", label: `Invoices (${invs.length})` },
              { id: "declined", label: `Declined work (${declined.length})` },
            ]}
          />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {tab === "jobs" && (history.length === 0 ? <EmptyState title="No visits yet" /> : (
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Job card</th><th className={thCls}>Date</th><th className={thCls}>Vehicle</th><th className={thCls}>Work</th><th className={thCls}>Status</th><th className={`${thCls} text-right`}>Total</th></tr></thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className={tdCls}>{can(user.role, "repair_orders") ? <Link href={`/repair-orders/${r.id}`} className="font-medium text-orange-700 hover:underline">{roNumber(r.number)}</Link> : roNumber(r.number)}</td>
                      <td className={tdCls}>{formatDate(r.createdAt)}</td>
                      <td className={tdCls}>{plate(r.vehicleId)}</td>
                      <td className={`${tdCls} max-w-xs truncate text-slate-600`}>{r.jobs.filter((j) => j.approval === "approved").map((j) => j.title).join(", ") || r.concern || "—"}</td>
                      <td className={tdCls}><RoStatusBadge status={r.status} /></td>
                      <td className={`${tdCls} text-right font-medium`}>{formatMoney(roTotals(r, workshop).total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            {tab === "invoices" && (invs.length === 0 ? <EmptyState title="No invoices yet" /> : (
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Invoice</th><th className={thCls}>Date</th><th className={thCls}>Vehicle</th><th className={thCls}>Status</th><th className={`${thCls} text-right`}>Total</th><th className={`${thCls} text-right`}>Balance</th></tr></thead>
                <tbody>
                  {invs.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className={tdCls}>{can(user.role, "invoices") ? <Link href={`/invoices/${i.id}`} className="font-medium text-orange-700 hover:underline">{i.number}</Link> : i.number}</td>
                      <td className={tdCls}>{formatDate(i.issuedAt)}</td>
                      <td className={tdCls}>{plate(i.vehicleId)}</td>
                      <td className={tdCls}><InvoiceBadge status={i.status} /></td>
                      <td className={`${tdCls} text-right`}>{formatMoney(i.totals.total)}</td>
                      <td className={`${tdCls} text-right font-medium`}>{formatMoney(invoiceBalance(i, payments))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            {tab === "declined" && (declined.length === 0 ? <EmptyState title="No declined work" text="Jobs the customer declines are kept here to offer again next visit." /> : (
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Job</th><th className={thCls}>Vehicle</th><th className={thCls}>Declined on</th><th className={thCls}>From</th></tr></thead>
                <tbody>
                  {declined.map(({ r, j }) => (
                    <tr key={j.id}>
                      <td className={`${tdCls} font-medium`}>{j.title}</td>
                      <td className={tdCls}>{plate(r.vehicleId)}</td>
                      <td className={tdCls}>{formatDate(r.createdAt)}</td>
                      <td className={tdCls}>{roNumber(r.number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      </div>

      {modal === "edit" && <CustomerModal open onClose={() => setModal(null)} customer={customer} />}
      {modal === "vehicle" && <VehicleModal open onClose={() => setModal(null)} customerId={customer.id} />}
      {modal && typeof modal === "object" && <VehicleModal open onClose={() => setModal(null)} customerId={customer.id} vehicle={modal} />}
    </>
  );
}
