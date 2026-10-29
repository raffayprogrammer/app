"use client";

import {
  ArrowLeft, Ban, Car, CheckCircle2, FileText, Package, Phone, Plus, Printer, RotateCcw, Trash2, User, Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApprovalBadge, RoStatusBadge, WorkLabelBadge } from "@/components/badges";
import { attempt, attemptResult, toast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { approvedPartUsage, jobTotal, lineAmount, roTotals } from "@/lib/calc";
import { cn, formatDateTime, roNumber, toLocalInput } from "@/lib/format";
import { useLookups, useStock, type StockRow } from "@/lib/hooks";
import { LINE_KIND, WORK_LABEL } from "@/lib/meta";
import { formatMoney, toPaisa, toRupees } from "@/lib/money";
import { can } from "@/lib/permissions";
import { useAuthed, useScoped, useStore } from "@/lib/store";
import type { Approval, Job, Line, RepairOrder, WorkLabel } from "@/lib/types";

export default function RepairOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, workshop } = useAuthed();
  const ros = useScoped("ros");
  const ro = ros.find((r) => r.id === id);
  const look = useLookups();
  const users = useScoped("users");
  const cannedJobs = useScoped("cannedJobs");
  const stock = useStock();
  const a = useStore.getState();
  const [newJob, setNewJob] = useState("");
  const [modal, setModal] = useState<null | "cancel" | "complete" | { partFor: string }>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ro) {
    return <EmptyState title="Job card not found" action={<Link href="/board"><Button variant="secondary">Back to Job Board</Button></Link>} />;
  }

  const customer = look.customer(ro.customerId);
  const vehicle = look.vehicle(ro.vehicleId);
  const editable = ro.status === "estimate" || ro.status === "in_progress";
  const totals = roTotals(ro, workshop);
  const technicians = users.filter((u) => u.role === "technician" && (u.active || u.id === ro.technicianId));
  const pending = ro.jobs.filter((j) => j.approval === "pending").length;

  const addJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await attempt(() => a.addJob(ro.id, newJob))) setNewJob("");
  };

  const createInvoice = async () => {
    if (busy) return;
    setBusy(true);
    const invId = await attemptResult(() => a.createInvoice(ro.id), "Invoice created");
    setBusy(false);
    if (invId) router.push(`/invoices/${invId}`);
  };

  return (
    <>
      <div className="mb-4">
        <Link href="/board" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Job Board
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{roNumber(ro.number)}</h1>
            <RoStatusBadge status={ro.status} />
            {ro.status === "in_progress" && <WorkLabelBadge label={ro.label} />}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {vehicle?.plate} · {vehicle?.make} {vehicle?.model} · opened {formatDateTime(ro.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ro.status !== "cancelled" && (
            <Link href={`/print/estimate/${ro.id}`} target="_blank">
              <Button variant="secondary"><Printer className="h-4 w-4" /> {ro.status === "estimate" ? "Print estimate" : "Print job card"}</Button>
            </Link>
          )}
          {editable && (
            <Button variant="ghost" onClick={() => setModal("cancel")}><Ban className="h-4 w-4" /> Cancel</Button>
          )}
          {ro.status === "in_progress" && (
            <>
              <Select value={ro.label} onChange={(e) => attempt(() => a.updateRo(ro.id, { label: e.target.value as WorkLabel }))} className="w-auto">
                {(Object.keys(WORK_LABEL) as WorkLabel[]).map((l) => <option key={l} value={l}>{WORK_LABEL[l].label}</option>)}
              </Select>
              <Button variant="success" onClick={() => setModal("complete")}><CheckCircle2 className="h-4 w-4" /> Complete work</Button>
            </>
          )}
          {ro.status === "completed" && (
            <>
              <Button variant="secondary" onClick={() => attempt(() => a.reopenRo(ro.id), "Job card reopened — parts returned to stock")}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </Button>
              {can(user.role, "invoices") && <Button onClick={createInvoice} disabled={busy}><FileText className="h-4 w-4" /> Create invoice</Button>}
            </>
          )}
          {ro.invoiceId && (
            <Link href={`/invoices/${ro.invoiceId}`}><Button><FileText className="h-4 w-4" /> View invoice</Button></Link>
          )}
        </div>
      </div>

      {ro.status === "estimate" && ro.jobs.length > 0 && pending > 0 && (
        <div className="mb-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800 ring-1 ring-violet-200">
          Share or print the estimate, then mark each job <b>Approved</b> or <b>Declined</b> as the customer decides. The job card moves to
          <b> Work in progress</b> as soon as one job is approved.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Customer">
            <Link href={`/customers/${customer?.id}`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-orange-700">
              <User className="h-4 w-4 text-slate-400" /> {customer?.name}
            </Link>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Phone className="h-4 w-4 text-slate-400" /> {customer?.phone}</p>
            {customer?.notes && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{customer.notes}</p>}
          </Card>
          <Card title="Vehicle">
            <p className="flex items-center gap-2 font-semibold text-slate-900"><Car className="h-4 w-4 text-slate-400" /> {vehicle?.plate}</p>
            <p className="mt-1 text-sm text-slate-600">{vehicle?.make} {vehicle?.model} {vehicle?.year}</p>
            {vehicle?.vin && <p className="text-xs text-slate-400">VIN {vehicle.vin}</p>}
          </Card>
          <Card title="Check-in">
            <DetailsForm ro={ro} technicians={technicians} editable={ro.status !== "closed" && ro.status !== "cancelled"} />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {ro.jobs.length === 0 && (
            <Card>
              <EmptyState icon={<Wrench className="h-8 w-8" />} title="No jobs yet" text="Add the work needed — type a job name or pick a canned job." />
            </Card>
          )}
          {ro.jobs.map((job) => (
            <JobCard key={job.id} ro={ro} job={job} editable={editable} stock={stock} onAddPart={() => setModal({ partFor: job.id })} />
          ))}

          {editable && (
            <Card>
              <form onSubmit={addJob} className="flex flex-col gap-2 sm:flex-row">
                <Input value={newJob} onChange={(e) => setNewJob(e.target.value)} placeholder="New job, e.g. Replace front brake pads" />
                <Button type="submit" variant="secondary" className="shrink-0"><Plus className="h-4 w-4" /> Add job</Button>
                <Select
                  value=""
                  onChange={(e) => e.target.value && attempt(() => a.addCannedJobToRo(ro.id, e.target.value), "Canned job added")}
                  className="sm:w-56"
                >
                  <option value="">+ Canned job…</option>
                  {cannedJobs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </Select>
              </form>
            </Card>
          )}

          <TotalsCard ro={ro} totals={totals} canDiscount={can(user.role, "discount") && editable} />
          {ro.notes && <Card title="Notes"><p className="whitespace-pre-wrap text-sm text-slate-600">{ro.notes}</p></Card>}
        </div>
      </div>

      {typeof modal === "object" && modal && (
        <PartPicker
          stock={stock}
          onClose={() => setModal(null)}
          onPick={async (part, qty) => {
            if (await attempt(() => a.addLine(ro.id, modal.partFor, { kind: "part", description: part.name, partId: part.id, qty, unitPrice: part.price }), `${part.name} added`)) setModal(null);
          }}
        />
      )}

      <Modal
        open={modal === "cancel"}
        onClose={() => setModal(null)}
        title={`Cancel ${roNumber(ro.number)}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Keep it</Button>
            <Button variant="danger" onClick={async () => { if (await attempt(() => a.cancelRo(ro.id, cancelReason), "Job card cancelled")) setModal(null); }}>Cancel job card</Button>
          </>
        }
      >
        <Field label="Reason"><Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Customer took the car elsewhere" /></Field>
      </Modal>

      {modal === "complete" && <CompleteModal ro={ro} onClose={() => setModal(null)} />}
    </>
  );
}

function DetailsForm({ ro, technicians, editable }: { ro: RepairOrder; technicians: { id: string; name: string }[]; editable: boolean }) {
  const updateRo = useStore((s) => s.updateRo);
  const [concern, setConcern] = useState(ro.concern);
  return (
    <div className="space-y-3 text-sm">
      <Field label="Technician">
        <Select value={ro.technicianId ?? ""} disabled={!editable} onChange={(e) => attempt(() => updateRo(ro.id, { technicianId: e.target.value || null }), "Technician assigned")}>
          <option value="">Unassigned</option>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Promised ready by">
        <Input
          type="datetime-local"
          disabled={!editable}
          value={toLocalInput(ro.promisedAt)}
          onChange={(e) => attempt(() => updateRo(ro.id, { promisedAt: e.target.value ? new Date(e.target.value).toISOString() : null }))}
        />
      </Field>
      <div className="flex justify-between"><span className="text-slate-500">Odometer in</span><span className="font-medium">{ro.odometerIn?.toLocaleString() ?? "—"} km</span></div>
      <Field label="Customer's complaint">
        <Textarea value={concern} disabled={!editable} onChange={(e) => setConcern(e.target.value)} onBlur={() => concern !== ro.concern && attempt(() => updateRo(ro.id, { concern }), "Saved")} />
      </Field>
    </div>
  );
}

function JobCard({ ro, job, editable, stock, onAddPart }: { ro: RepairOrder; job: Job; editable: boolean; stock: StockRow[]; onAddPart: () => void }) {
  const a = useStore.getState();
  const { workshop } = useAuthed();
  const [title, setTitle] = useState(job.title);
  const canApprove = editable;
  const approvals: { v: Approval; label: string; cls: string }[] = [
    { v: "pending", label: "Pending", cls: "data-[on=true]:bg-amber-100 data-[on=true]:text-amber-800" },
    { v: "approved", label: "Approved", cls: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white" },
    { v: "declined", label: "Declined", cls: "data-[on=true]:bg-red-100 data-[on=true]:text-red-700" },
  ];

  return (
    <section className={cn("rounded-xl border bg-white shadow-sm", job.approval === "declined" ? "border-slate-200 opacity-70" : job.approval === "approved" ? "border-emerald-200" : "border-amber-200")}>
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        {ro.status === "in_progress" && job.approval === "approved" && (
          <input
            type="checkbox"
            checked={job.done}
            onChange={(e) => attempt(() => a.updateJob(ro.id, job.id, { done: e.target.checked }))}
            className="h-4 w-4 accent-emerald-600"
            title="Mark job done"
          />
        )}
        {editable ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== job.title && attempt(() => a.updateJob(ro.id, job.id, { title }))}
            className={cn("min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 font-semibold text-slate-900 hover:border-slate-200 focus:border-orange-500 focus:outline-none", job.done && "line-through")}
          />
        ) : (
          <h3 className={cn("flex-1 font-semibold text-slate-900", job.done && "line-through")}>{job.title}</h3>
        )}
        {canApprove ? (
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            {approvals.map((o) => (
              <button
                key={o.v}
                data-on={job.approval === o.v}
                onClick={() => job.approval !== o.v && attempt(() => a.setJobApproval(ro.id, job.id, o.v))}
                className={cn("rounded-md px-2.5 py-1 text-slate-500 hover:text-slate-800", o.cls)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <ApprovalBadge approval={job.approval} />
        )}
        {editable && (
          <button onClick={() => attempt(() => a.removeJob(ro.id, job.id), "Job removed")} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove job">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="w-20 px-2 py-2 text-right font-medium">Qty</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Price</th>
              <th className="w-28 px-4 py-2 text-right font-medium">Amount</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {job.lines.map((l) => (
              <LineRow key={l.id} ro={ro} job={job} line={l} editable={editable} stockRow={l.partId ? stock.find((p) => p.id === l.partId) : undefined} />
            ))}
            {job.lines.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-center text-xs text-slate-400">No lines yet — add labour, parts or a fee.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        {editable ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => attempt(() => a.addLine(ro.id, job.id, { kind: "labor", description: "Labour", qty: 1, unitPrice: workshop.laborRate }))}>
              <Wrench className="h-3.5 w-3.5" /> Labour
            </Button>
            <Button size="sm" variant="ghost" onClick={onAddPart}><Package className="h-3.5 w-3.5" /> Part</Button>
            <Button size="sm" variant="ghost" onClick={() => attempt(() => a.addLine(ro.id, job.id, { kind: "fee", description: "Other charge", qty: 1, unitPrice: 0 }))}>
              <Plus className="h-3.5 w-3.5" /> Fee / outside work
            </Button>
          </div>
        ) : <span />}
        <span className="text-sm font-semibold text-slate-900">{formatMoney(jobTotal(job))}</span>
      </footer>
    </section>
  );
}

function LineRow({ ro, job, line, editable, stockRow }: { ro: RepairOrder; job: Job; line: Line; editable: boolean; stockRow?: StockRow }) {
  const a = useStore.getState();
  const [desc, setDesc] = useState(line.description);
  const [qty, setQty] = useState(String(line.qty));
  const [price, setPrice] = useState(String(toRupees(line.unitPrice)));

  const commit = async (patch: Partial<Pick<Line, "description" | "qty" | "unitPrice">>, reset: () => void) => {
    if (!(await attempt(() => a.updateLine(ro.id, job.id, line.id, patch)))) reset();
  };

  const short = stockRow && !ro.stockDeducted && job.approval !== "declined" && stockRow.available < 0;
  const cell = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-orange-500 focus:bg-white focus:outline-none";

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-1.5">
        <Badge tone={line.kind === "part" ? "blue" : line.kind === "labor" ? "violet" : "slate"}>{LINE_KIND[line.kind]}</Badge>
      </td>
      <td className="px-2 py-1.5">
        {editable && line.kind !== "part" ? (
          <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== line.description && commit({ description: desc }, () => setDesc(line.description))} className={cell} />
        ) : (
          <span>{line.description}</span>
        )}
        {stockRow && (
          <span className={cn("ml-1 text-xs", short ? "font-medium text-red-600" : "text-slate-400")}>
            {stockRow.partNumber} · {stockRow.qtyOnHand} in stock{short ? " — not enough" : ""}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editable ? (
          <input
            type="number" min="0" step={line.kind === "labor" ? "0.25" : "1"} value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => Number(qty) !== line.qty && commit({ qty: Number(qty) }, () => setQty(String(line.qty)))}
            className={cn(cell, "text-right")}
          />
        ) : (
          <span>{line.qty}{line.kind === "labor" ? " h" : ""}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {editable ? (
          <input
            type="number" min="0" step="0.01" value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => toPaisa(price) !== line.unitPrice && commit({ unitPrice: toPaisa(price) }, () => setPrice(String(toRupees(line.unitPrice))))}
            className={cn(cell, "text-right")}
          />
        ) : (
          <span>{formatMoney(line.unitPrice, false)}</span>
        )}
      </td>
      <td className="px-4 py-1.5 text-right font-medium">{formatMoney(lineAmount(line), false)}</td>
      {editable && (
        <td className="pr-3">
          <button onClick={() => attempt(() => a.removeLine(ro.id, job.id, line.id))} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" title="Remove line">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

function TotalsCard({ ro, totals, canDiscount }: { ro: RepairOrder; totals: ReturnType<typeof roTotals>; canDiscount: boolean }) {
  const updateRo = useStore((s) => s.updateRo);
  const { workshop } = useAuthed();
  const [discount, setDiscount] = useState(String(toRupees(ro.discount)));
  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div className={cn("flex justify-between py-1", strong && "border-t border-slate-200 pt-2 text-base font-semibold text-slate-900")}>
      <span className={strong ? "" : "text-slate-500"}>{label}</span><span>{value}</span>
    </div>
  );
  return (
    <Card title={ro.status === "estimate" ? "Estimate total (excluding declined jobs)" : "Approved work total"}>
      <div className="ml-auto max-w-sm text-sm">
        {row("Parts", formatMoney(totals.parts))}
        {row("Labour", formatMoney(totals.labor))}
        {totals.fees > 0 && row("Fees & outside work", formatMoney(totals.fees))}
        <div className="flex items-center justify-between py-1">
          <span className="text-slate-500">Discount</span>
          {canDiscount ? (
            <input
              type="number" min="0" step="1" value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              onBlur={async () => {
                if (toPaisa(discount) === ro.discount) return;
                if (!(await attempt(() => updateRo(ro.id, { discount: toPaisa(discount) }), "Discount updated"))) setDiscount(String(toRupees(ro.discount)));
              }}
              className="w-28 rounded border border-slate-200 px-2 py-0.5 text-right focus:border-orange-500 focus:outline-none"
            />
          ) : (
            <span>{totals.discount ? `-${formatMoney(totals.discount)}` : formatMoney(0)}</span>
          )}
        </div>
        {row(`Sales tax on parts (${workshop.partsTaxRate}%)`, formatMoney(totals.partsTax))}
        {workshop.laborTaxRate > 0 && row(`Tax on services (${workshop.laborTaxRate}%)`, formatMoney(totals.laborTax))}
        {row("Total", formatMoney(totals.total), true)}
      </div>
    </Card>
  );
}

function CompleteModal({ ro, onClose }: { ro: RepairOrder; onClose: () => void }) {
  const completeWork = useStore((s) => s.completeWork);
  const [busy, setBusy] = useState(false);
  const look = useLookups();
  const usage = useMemo(() => [...approvedPartUsage(ro)], [ro]);
  const declined = ro.jobs.filter((j) => j.approval === "declined");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${roNumber(ro.number)}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Not yet</Button>
          <Button variant="success" disabled={busy} onClick={async () => {
            setBusy(true);
            const ok = await attempt(() => completeWork(ro.id), "Work completed — parts taken out of stock");
            setBusy(false);
            if (ok) onClose();
          }}>
            Complete work
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">The job card moves to <b>Completed</b> and these parts are taken out of stock:</p>
      {usage.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No stock parts used.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {usage.map(([partId, qty]) => {
            const p = look.part(partId);
            return (
              <li key={partId} className="flex justify-between px-3 py-2">
                <span>{p?.name}</span>
                <span className={cn("font-medium", p && p.qtyOnHand < qty && "text-red-600")}>{qty} <span className="text-xs text-slate-400">of {p?.qtyOnHand}</span></span>
              </li>
            );
          })}
        </ul>
      )}
      {declined.length > 0 && <p className="mt-3 text-xs text-slate-500">{declined.length} declined job{declined.length > 1 ? "s" : ""} will be kept on record and not charged.</p>}
    </Modal>
  );
}

function PartPicker({ stock, onClose, onPick }: { stock: StockRow[]; onClose: () => void; onPick: (part: StockRow, qty: number) => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stock
      .filter((p) => p.active)
      .filter((p) => !term || [p.name, p.partNumber, p.brand, p.category].some((x) => x.toLowerCase().includes(term)))
      .slice(0, 40);
  }, [stock, q]);

  return (
    <Modal open onClose={onClose} title="Add part" wide>
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part name, number or brand" autoFocus />
        <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-24" aria-label="Quantity" />
      </div>
      <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
        {list.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">No parts found. Add it in Inventory first.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-slate-100 hover:bg-orange-50" onClick={() => {
                  const n = Number(qty);
                  if (!Number.isFinite(n) || n <= 0) return toast("Enter a quantity", "error");
                  onPick(p, n);
                }}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.partNumber} · {p.brand} · bin {p.location || "—"}</p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("text-xs font-medium", p.available <= 0 ? "text-red-600" : p.low ? "text-amber-600" : "text-emerald-600")}>
                      {p.available} available
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
