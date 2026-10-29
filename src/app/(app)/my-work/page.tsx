"use client";

import { Clock, HardHat } from "lucide-react";
import { useState } from "react";
import { RoStatusBadge } from "@/components/badges";
import { attempt } from "@/components/toast";
import { Badge, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { cn, formatTime, roNumber } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { LINE_KIND, WORK_LABEL } from "@/lib/meta";
import { useAuthed, useScoped, useStore } from "@/lib/store";
import type { WorkLabel } from "@/lib/types";

export default function MyWorkPage() {
  const { user } = useAuthed();
  const ros = useScoped("ros");
  const users = useScoped("users");
  const look = useLookups();
  const updateJob = useStore((s) => s.updateJob);
  const updateRo = useStore((s) => s.updateRo);
  const technicians = users.filter((u) => u.role === "technician");
  const [techId, setTechId] = useState(user.role === "technician" ? user.id : technicians[0]?.id ?? "");

  const mine = ros
    .filter((r) => r.technicianId === techId && (r.status === "in_progress" || r.status === "estimate"))
    .sort((a, b) => (a.promisedAt ?? "9").localeCompare(b.promisedAt ?? "9"));

  return (
    <>
      <PageHeader
        title="My Work"
        subtitle="Cars assigned to you. Tick each job off as you finish it."
        actions={
          user.role !== "technician" && (
            <Select value={techId} onChange={(e) => setTechId(e.target.value)} className="w-auto">
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )
        }
      />
      {mine.length === 0 ? (
        <Card><EmptyState icon={<HardHat className="h-8 w-8" />} title="No cars assigned right now" text="New work will show up here when the service advisor assigns it." /></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {mine.map((r) => {
            const v = look.vehicle(r.vehicleId);
            const approved = r.jobs.filter((j) => j.approval === "approved");
            const pending = r.jobs.filter((j) => j.approval === "pending");
            const overdue = r.promisedAt && new Date(r.promisedAt) < new Date();
            return (
              <Card
                key={r.id}
                title={
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{v?.plate}</span>
                    <span className="text-sm font-normal text-slate-500">{v?.make} {v?.model}</span>
                  </span>
                }
                actions={<span className="text-xs text-slate-400">{roNumber(r.number)}</span>}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <RoStatusBadge status={r.status} />
                  {r.promisedAt && (
                    <Badge tone={overdue ? "red" : "slate"}><Clock className="h-3 w-3" /> Due {formatTime(r.promisedAt)}</Badge>
                  )}
                  {r.status === "in_progress" && (
                    <Select
                      value={r.label}
                      onChange={(e) => attempt(() => updateRo(r.id, { label: e.target.value as WorkLabel }), "Status updated")}
                      className="ml-auto h-8 w-auto text-xs"
                    >
                      {(Object.keys(WORK_LABEL) as WorkLabel[]).map((l) => <option key={l} value={l}>{WORK_LABEL[l].label}</option>)}
                    </Select>
                  )}
                </div>
                {r.concern && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><b>Complaint:</b> {r.concern}</p>}

                <ul className="space-y-2">
                  {approved.map((j) => (
                    <li key={j.id} className={cn("rounded-lg border px-3 py-2", j.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200")}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-emerald-600"
                          checked={j.done}
                          disabled={r.status !== "in_progress"}
                          onChange={(e) => attempt(() => updateJob(r.id, j.id, { done: e.target.checked }), e.target.checked ? "Job marked done" : undefined)}
                        />
                        <span className={cn("font-medium", j.done && "text-emerald-800 line-through")}>{j.title}</span>
                      </label>
                      <ul className="ml-8 mt-1 text-xs text-slate-500">
                        {j.lines.map((l) => (
                          <li key={l.id}>{LINE_KIND[l.kind]}: {l.description} × {l.qty}{l.kind === "labor" ? " h" : ""}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                  {pending.map((j) => (
                    <li key={j.id} className="rounded-lg border border-dashed border-amber-300 px-3 py-2 text-sm text-amber-800">
                      {j.title} — <span className="text-xs">waiting for customer approval, don&apos;t start yet</span>
                    </li>
                  ))}
                  {approved.length === 0 && pending.length === 0 && <li className="text-sm text-slate-400">No jobs added yet.</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
