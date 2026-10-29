"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RoStatusBadge, WorkLabelBadge } from "@/components/badges";
import { Badge, EmptyState, Input, PageHeader, Select, tableCls, tdCls, thCls } from "@/components/ui";
import { approvedJobs, roTotals } from "@/lib/calc";
import { cn, formatDate, formatTime, roNumber } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { useAuthed, useScoped } from "@/lib/store";
import type { RepairOrder } from "@/lib/types";

type View = "active" | "closed" | "cancelled";
type GroupBy = "status" | "technician";

const COLUMNS: { id: string; title: string; match: (r: RepairOrder) => boolean; accent: string }[] = [
  { id: "estimate", title: "Estimates", match: (r) => r.status === "estimate", accent: "bg-violet-500" },
  { id: "wip", title: "Work in progress", match: (r) => r.status === "in_progress", accent: "bg-blue-500" },
  { id: "done", title: "Completed", match: (r) => r.status === "completed" || r.status === "invoiced", accent: "bg-amber-500" },
];

export default function BoardPage() {
  const { workshop } = useAuthed();
  const ros = useScoped("ros");
  const users = useScoped("users");
  const invoices = useScoped("invoices");
  const look = useLookups();
  const [view, setView] = useState<View>("active");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [tech, setTech] = useState("all");
  const [q, setQ] = useState("");

  const technicians = users.filter((u) => u.role === "technician" && u.active);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ros
      .filter((r) => {
        if (view === "active") return ["estimate", "in_progress", "completed", "invoiced"].includes(r.status);
        if (view === "closed") return r.status === "closed";
        return r.status === "cancelled";
      })
      .filter((r) => tech === "all" || (tech === "none" ? !r.technicianId : r.technicianId === tech))
      .filter((r) => {
        if (!term) return true;
        const v = look.vehicle(r.vehicleId);
        const c = look.customer(r.customerId);
        return [roNumber(r.number), v?.plate, v?.make, v?.model, c?.name, c?.phone].some((x) => x?.toLowerCase().includes(term));
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [ros, view, tech, q, look]);

  const columns =
    groupBy === "status"
      ? COLUMNS.map((c) => ({ ...c, items: filtered.filter(c.match) }))
      : [
          ...technicians.map((t) => ({ id: t.id, title: t.name, accent: "bg-blue-500", items: filtered.filter((r) => r.technicianId === t.id) })),
          { id: "none", title: "Unassigned", accent: "bg-slate-400", items: filtered.filter((r) => !r.technicianId) },
        ];

  return (
    <>
      <PageHeader title="Job Board" subtitle="Every car in the workshop, from estimate to pickup." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={view} onChange={(e) => setView(e.target.value as View)} className="w-auto">
          <option value="active">Active</option>
          <option value="closed">Paid & closed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        {view === "active" && (
          <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="w-auto">
            <option value="status">Group by status</option>
            <option value="technician">Group by technician</option>
          </Select>
        )}
        <Select value={tech} onChange={(e) => setTech(e.target.value)} className="w-auto">
          <option value="all">All technicians</option>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="none">Unassigned</option>
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by plate, name, RO…" className="w-full sm:w-64" />
      </div>

      {view === "active" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <section key={col.id} className="flex w-80 shrink-0 flex-col rounded-xl bg-slate-100/80">
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={cn("h-2 w-2 rounded-full", col.accent)} />
                <h2 className="text-sm font-semibold text-slate-700">{col.title}</h2>
                <span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-slate-500">{col.items.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {col.items.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">Nothing here</p>}
                {col.items.map((r) => {
                  const v = look.vehicle(r.vehicleId);
                  const c = look.customer(r.customerId);
                  const t = look.user(r.technicianId);
                  const approved = approvedJobs(r);
                  const done = approved.filter((j) => j.done).length;
                  const pending = r.jobs.filter((j) => j.approval === "pending").length;
                  const inv = r.invoiceId ? invoices.find((i) => i.id === r.invoiceId) : undefined;
                  const overdue = r.promisedAt && new Date(r.promisedAt) < new Date() && ["estimate", "in_progress"].includes(r.status);
                  return (
                    <Link
                      key={r.id}
                      href={`/repair-orders/${r.id}`}
                      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-orange-300 hover:shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {r.status === "estimate" && (
                            <Badge tone={r.jobs.length === 0 ? "slate" : pending ? "amber" : "red"}>
                              {r.jobs.length === 0 ? "Not started" : pending ? `${pending} awaiting approval` : "All declined"}
                            </Badge>
                          )}
                          {r.status === "in_progress" && (r.label !== "none" ? <WorkLabelBadge label={r.label} /> : <Badge tone="blue">In progress</Badge>)}
                          {r.status === "completed" && <Badge tone="amber">Ready to invoice</Badge>}
                          {r.status === "invoiced" && <Badge tone={inv?.status === "partial" ? "amber" : "red"}>{inv?.status === "partial" ? "Part paid" : "Awaiting payment"}</Badge>}
                          {groupBy === "technician" && <RoStatusBadge status={r.status} />}
                        </div>
                        <span className="text-xs font-medium text-slate-400">{roNumber(r.number)}</span>
                      </div>
                      <p className="mt-2 font-semibold text-slate-900">{v?.plate}</p>
                      <p className="text-sm text-slate-600">{v?.make} {v?.model} {v?.year}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{c?.name}</p>
                      {r.status === "in_progress" && approved.length > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${(done / approved.length) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{done} of {approved.length} jobs done</p>
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          {t ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white" title={t.name}>
                              {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                          {r.promisedAt && (
                            <span className={cn("flex items-center gap-0.5", overdue && "font-medium text-red-600")}>
                              <Clock className="h-3 w-3" /> {formatTime(r.promisedAt)}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-slate-800">{formatMoney(roTotals(r, workshop).total)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <EmptyState title={view === "closed" ? "No closed job cards yet" : "No cancelled job cards"} />
          ) : (
            <table className={tableCls}>
              <thead><tr><th className={thCls}>Job card</th><th className={thCls}>Vehicle</th><th className={thCls}>Customer</th><th className={thCls}>Updated</th><th className={thCls}>Status</th><th className={`${thCls} text-right`}>Total</th></tr></thead>
              <tbody>
                {filtered.map((r) => {
                  const v = look.vehicle(r.vehicleId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className={tdCls}><Link href={`/repair-orders/${r.id}`} className="font-medium text-orange-700 hover:underline">{roNumber(r.number)}</Link></td>
                      <td className={tdCls}>{v?.plate} <span className="text-slate-500">{v?.make} {v?.model}</span></td>
                      <td className={tdCls}>{look.customer(r.customerId)?.name}</td>
                      <td className={tdCls}>{formatDate(r.updatedAt)}</td>
                      <td className={tdCls}><RoStatusBadge status={r.status} /></td>
                      <td className={`${tdCls} text-right font-medium`}>{formatMoney(roTotals(r, workshop).total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
