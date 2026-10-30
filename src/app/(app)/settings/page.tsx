"use client";

import { Mail, Pencil, Plug, PlugZap, Plus, Printer, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { disconnectGmail, getEmailConnection } from "@/app/actions/email";
import { EMAIL_SENDING_LIVE } from "@/lib/features";
import { createStaffAccount } from "@/app/actions/team";
import { attempt, toast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, tableCls, tdCls, thCls } from "@/components/ui";
import { lineAmount } from "@/lib/calc";
import { formatDateTime } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { LINE_KIND } from "@/lib/meta";
import { formatMoney, toPaisa, toRupees } from "@/lib/money";
import { can, ROLE_LABELS } from "@/lib/permissions";
import {
  connectPrinter, disconnectPrinter, printTestPage, reconnectPrinter, serialSupported, usePrinterConnected,
} from "@/lib/printer";
import { useAuthed, useScoped, useStore } from "@/lib/store";
import type { CannedJob, LineKind, PrinterSettings, Role, User } from "@/lib/types";

const noSubscribe = () => () => {};

type Tab = "workshop" | "billing" | "team" | "canned" | "email" | "printer" | "activity";

const GMAIL_RESULT: Record<string, [string, "success" | "error"]> = {
  connected: ["Gmail connected. You can now email invoices.", "success"],
  cancelled: ["Gmail connection was cancelled.", "error"],
  expired: ["The Google sign-in took too long. Please try again.", "error"],
  forbidden: ["Only the workshop owner can connect Gmail.", "error"],
  noscope: ["Please tick the permission to send email when Google asks.", "error"],
  error: ["Couldn't connect Gmail. Please try again.", "error"],
};

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { user } = useAuthed();
  const params = useSearchParams();
  const router = useRouter();
  const gmail = params.get("gmail");
  const owner = can(user.role, "settings");
  const all: (false | { id: Tab; label: string })[] = [
    owner && { id: "workshop", label: "Workshop" },
    owner && { id: "billing", label: "Billing & tax" },
    can(user.role, "users") && { id: "team", label: "Team" },
    owner && { id: "canned", label: "Canned jobs" },
    owner && EMAIL_SENDING_LIVE && { id: "email", label: "Email" },
    { id: "printer", label: "Printer" },
    can(user.role, "audit") && { id: "activity", label: "Activity log" },
  ];
  const tabs = all.filter((t): t is { id: Tab; label: string } => !!t);
  const [tab, setTab] = useState<Tab>(gmail && owner && EMAIL_SENDING_LIVE ? "email" : tabs[0].id);

  // Coming back from Google: show the result once, then tidy the address bar.
  useEffect(() => {
    if (!gmail) return;
    const [msg, kind] = GMAIL_RESULT[gmail] ?? GMAIL_RESULT.error;
    toast(msg, kind);
    router.replace("/settings");
  }, [gmail, router]);
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "workshop" && <WorkshopTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "team" && <TeamTab />}
      {tab === "canned" && <CannedTab />}
      {tab === "email" && <EmailTab />}
      {tab === "printer" && <PrinterTab />}
      {tab === "activity" && <ActivityTab />}
    </>
  );
}

function WorkshopTab() {
  const { workshop } = useAuthed();
  const update = useStore((s) => s.updateWorkshop);
  const [f, setF] = useState({ name: workshop.name, phone: workshop.phone, email: workshop.email, address: workshop.address, city: workshop.city, ntn: workshop.ntn });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Workshop details" className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.name.trim()) return toast("Workshop name is required", "error");
          attempt(() => update(f), "Workshop details saved");
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Workshop name" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} required /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="City"><Input value={f.city} onChange={set("city")} /></Field>
        <Field label="NTN" hint="Printed on invoices"><Input value={f.ntn} onChange={set("ntn")} /></Field>
        <div className="sm:col-span-2"><Button type="submit">Save</Button></div>
      </form>
    </Card>
  );
}

function BillingTab() {
  const { workshop } = useAuthed();
  const update = useStore((s) => s.updateWorkshop);
  const [f, setF] = useState({
    laborRate: String(toRupees(workshop.laborRate)), partsTaxRate: String(workshop.partsTaxRate),
    laborTaxRate: String(workshop.laborTaxRate), invoicePrefix: workshop.invoicePrefix,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Billing & tax" className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const prefix = f.invoicePrefix.trim().toUpperCase();
          if (!/^[A-Z0-9-]{1,8}$/.test(prefix)) return toast("Invoice prefix: 1–8 letters, numbers or dashes", "error");
          attempt(() => update({ laborRate: toPaisa(f.laborRate), partsTaxRate: Number(f.partsTaxRate), laborTaxRate: Number(f.laborTaxRate), invoicePrefix: prefix }), "Billing settings saved");
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Labour rate per hour (Rs)" hint="Default for new labour lines"><Input type="number" min="0" value={f.laborRate} onChange={set("laborRate")} /></Field>
        <Field label="Invoice prefix" hint={`Next invoice: ${f.invoicePrefix.trim().toUpperCase() || "INV"}-${String(workshop.nextInvoiceSeq).padStart(6, "0")}`}>
          <Input value={f.invoicePrefix} onChange={set("invoicePrefix")} className="uppercase" />
        </Field>
        <Field label="Sales tax on parts (%)" hint="Federal sales tax on goods"><Input type="number" min="0" max="100" step="0.01" value={f.partsTaxRate} onChange={set("partsTaxRate")} /></Field>
        <Field label="Tax on labour & services (%)" hint="Provincial services tax — set per province later"><Input type="number" min="0" max="100" step="0.01" value={f.laborTaxRate} onChange={set("laborTaxRate")} /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">
          Invoice numbers run in sequence and are never reused, even if an invoice is voided. Changing tax rates only affects new invoices.
        </p>
        <div className="sm:col-span-2"><Button type="submit">Save</Button></div>
      </form>
    </Card>
  );
}

function TeamTab() {
  const { user: me } = useAuthed();
  const users = useScoped("users");
  const updateUser = useStore((s) => s.updateUser);
  const [adding, setAdding] = useState(false);
  return (
    <Card title="Team" actions={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add user</Button>} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead><tr><th className={thCls}>Name</th><th className={thCls}>Email</th><th className={thCls}>Role</th><th className={thCls}>Status</th><th className={thCls} /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={`${tdCls} font-medium`}>{u.name}{u.id === me.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</td>
                <td className={tdCls}>{u.email}</td>
                <td className={tdCls}>
                  <Select value={u.role} onChange={(e) => attempt(() => updateUser(u.id, { role: e.target.value as Role }), "Role updated")} className="h-8 w-auto text-xs">
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </Select>
                </td>
                <td className={tdCls}>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                <td className={`${tdCls} text-right`}>
                  {u.id !== me.id && (
                    <Button size="sm" variant="ghost" onClick={() => attempt(() => updateUser(u.id, { active: !u.active }), u.active ? "User deactivated" : "User reactivated")}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <b>Owner</b>: everything · <b>Service Advisor</b>: job cards, customers, invoices · <b>Cashier / Storekeeper</b>: payments, invoices, stock · <b>Technician</b>: own jobs only.
        Staff are deactivated, never deleted, so their history stays.
      </div>
      {adding && <AddUserModal onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const refresh = useStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<{ name: string; email: string; password: string; role: User["role"] }>({ name: "", email: "", password: "", role: "advisor" });
  return (
    <Modal open onClose={onClose} title="Add user" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" disabled={busy}>{busy ? "Adding…" : "Add user"}</Button></>}>
      <form
        id="user-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await createStaffAccount(f);
          setBusy(false);
          if (error) return toast(error, "error");
          toast(`${f.name} can now sign in`);
          await attempt(refresh);
          onClose();
        }}
        className="space-y-3"
      >
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus /></Field>
        <Field label="Email (used to sign in)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Temporary password" hint="At least 6 characters"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <Field label="Role">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function CannedTab() {
  const { user } = useAuthed();
  const canned = useScoped("cannedJobs");
  const deleteCanned = useStore((s) => s.deleteCannedJob);
  const [editing, setEditing] = useState<CannedJob | "new" | null>(null);
  const editable = can(user.role, "settings");
  return (
    <Card
      title="Canned jobs"
      actions={editable && <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New canned job</Button>}
      bodyClassName="p-0"
    >
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Preset jobs (labour + parts + fees) the advisor can add to a job card in one click. Part prices update from the current price list when added.</p>
      {canned.length === 0 ? <EmptyState title="No canned jobs yet" /> : (
        <ul className="divide-y divide-slate-100">
          {canned.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-slate-800">{c.title}</p>
                <p className="text-xs text-slate-500">{c.lines.map((l) => `${LINE_KIND[l.kind]}: ${l.description}`).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium">{formatMoney(c.lines.reduce((s, l) => s + lineAmount(l), 0))}</span>
                {editable && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => attempt(() => deleteCanned(c.id), "Canned job deleted")}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <CannedModal job={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

type DraftLine = { kind: LineKind; description: string; partId?: string; qty: string; price: string };

function CannedModal({ job, onClose }: { job?: CannedJob; onClose: () => void }) {
  const { workshop } = useAuthed();
  const parts = useScoped("parts");
  const save = useStore((s) => s.saveCannedJob);
  const [title, setTitle] = useState(job?.title ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    job?.lines.map((l) => ({ kind: l.kind, description: l.description, partId: l.partId, qty: String(l.qty), price: String(toRupees(l.unitPrice)) })) ??
      [{ kind: "labor", description: "Labour", qty: "1", price: String(toRupees(workshop.laborRate)) }],
  );
  const patch = (i: number, p: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some((l) => !(Number(l.qty) > 0))) return toast("Every line needs a quantity above zero", "error");
    if (lines.some((l) => l.kind === "part" && !l.partId)) return toast("Choose a part for every part line", "error");
    const out = lines.map((l) => ({ kind: l.kind, description: l.description.trim() || LINE_KIND[l.kind], partId: l.partId, qty: Number(l.qty), unitPrice: toPaisa(l.price || 0) }));
    if (await attempt(() => save({ title, lines: out }, job?.id), "Canned job saved")) onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={job ? "Edit canned job" : "New canned job"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="canned-form">Save</Button></>}>
      <form id="canned-form" onSubmit={submit} className="space-y-3">
        <Field label="Name"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil change – Corolla" required autoFocus /></Field>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <Select value={l.kind} onChange={(e) => patch(i, { kind: e.target.value as LineKind, partId: undefined })} className="col-span-2 px-2 text-xs">
                <option value="labor">Labour</option><option value="part">Part</option><option value="fee">Fee</option>
              </Select>
              {l.kind === "part" ? (
                <Select
                  value={l.partId ?? ""}
                  onChange={(e) => {
                    const p = parts.find((x) => x.id === e.target.value);
                    patch(i, { partId: p?.id, description: p?.name ?? "", price: p ? String(toRupees(p.price)) : l.price });
                  }}
                  className="col-span-6 text-xs"
                >
                  <option value="">Choose part…</option>
                  {parts.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.partNumber})</option>)}
                </Select>
              ) : (
                <Input value={l.description} onChange={(e) => patch(i, { description: e.target.value })} className="col-span-6" placeholder="Description" />
              )}
              <Input type="number" min="0" step="0.25" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} className="col-span-1 px-2" aria-label="Quantity" />
              <Input type="number" min="0" value={l.price} onChange={(e) => patch(i, { price: e.target.value })} className="col-span-2" aria-label="Price" disabled={l.kind === "part"} />
              <Button variant="ghost" className="col-span-1" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { kind: "labor", description: "Labour", qty: "1", price: String(toRupees(workshop.laborRate)) }])}>+ Labour</Button>
          <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { kind: "part", description: "", qty: "1", price: "0" }])}>+ Part</Button>
          <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { kind: "fee", description: "", qty: "1", price: "0" }])}>+ Fee</Button>
        </div>
      </form>
    </Modal>
  );
}

function EmailTab() {
  const [conn, setConn] = useState<{ email: string; connectedAt: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getEmailConnection().then((c) => live && setConn(c));
    return () => {
      live = false;
    };
  }, []);

  const disconnect = async () => {
    setBusy(true);
    const { error } = await disconnectGmail();
    setBusy(false);
    if (error) return toast(error, "error");
    setConn(null);
    toast("Gmail disconnected");
  };

  return (
    <Card title="Email invoices with Gmail" className="max-w-2xl" actions={conn ? <Badge tone="green">Connected</Badge> : conn === null ? <Badge>Not connected</Badge> : null}>
      {conn === undefined ? (
        <p className="text-sm text-slate-400">Checking…</p>
      ) : conn ? (
        <div className="space-y-4 text-sm">
          <p className="flex items-center gap-2 text-slate-700">
            <Mail className="h-4 w-4 text-slate-400" /> Invoices are sent from <b>{conn.email}</b>
          </p>
          <p className="text-xs text-slate-500">Connected {formatDateTime(conn.connectedAt)}. Customers can reply straight to this address.</p>
          <div className="flex gap-2">
            <a href="/api/google/connect"><Button variant="secondary">Switch account</Button></a>
            <Button variant="ghost" onClick={disconnect} disabled={busy}>Disconnect</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p>Connect the workshop&apos;s Gmail once. After that, every invoice has an <b>Email</b> button that sends it to the customer from your own address.</p>
          <p className="text-xs text-slate-500">WorkshopPOS only gets permission to <b>send</b> email. It can&apos;t read your inbox.</p>
          <a href="/api/google/connect"><Button><Mail className="h-4 w-4" /> Connect Gmail</Button></a>
        </div>
      )}
    </Card>
  );
}

function PrinterTab() {
  const { user, workshop } = useAuthed();
  const update = useStore((s) => s.updateWorkshop);
  const connected = usePrinterConnected();
  const supported = useSyncExternalStore(noSubscribe, serialSupported, () => false);
  const [f, setF] = useState<PrinterSettings>(workshop.printer);
  const editable = can(user.role, "settings");

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Closing the browser's port picker is not an error worth shouting about.
      if (!/No port selected|cancel/i.test(msg)) toast(msg, "error");
    }
  };

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card title="Receipt & invoice printing">
        <form
          onSubmit={(e) => { e.preventDefault(); attempt(() => update({ printer: f }), "Printer settings saved"); }}
          className="space-y-4"
        >
          <Field label="Paper" hint="Used when printing invoices">
            <Select value={f.paper} disabled={!editable} onChange={(e) => setF({ ...f, paper: e.target.value as PrinterSettings["paper"] })}>
              <option value="80mm">Thermal receipt 80mm</option>
              <option value="58mm">Thermal receipt 58mm</option>
              <option value="A4">A4 / Letter</option>
            </Select>
          </Field>
          <Field label="Receipt footer"><Input value={f.footer} disabled={!editable} onChange={(e) => setF({ ...f, footer: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={!editable} checked={f.autoPrintAfterPayment} onChange={(e) => setF({ ...f, autoPrintAfterPayment: e.target.checked })} />
            Print receipt automatically after each payment
          </label>
          {editable && <Button type="submit">Save</Button>}
        </form>
      </Card>

      <Card title="Connect a receipt printer" actions={connected ? <Badge tone="green"><PlugZap className="h-3 w-3" /> Connected</Badge> : <Badge><Plug className="h-3 w-3" /> Not connected</Badge>}>
        {!supported ? (
          <p className="text-sm text-slate-600">
            Direct printer connection needs <b>Chrome or Edge on a computer</b>. You can still print with the normal <b>Print</b> button — choose your receipt printer in the print dialog.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Connect a USB, serial or Bluetooth ESC/POS thermal printer to print receipts instantly with no print dialog. The browser will ask you to pick the printer.
            </p>
            <Field label="Baud rate" hint="Most printers use 9600 or 115200 — check the printer's self-test page.">
              <Select value={String(f.baudRate)} onChange={(e) => { const baudRate = Number(e.target.value); setF({ ...f, baudRate }); if (editable) attempt(() => update({ printer: { ...workshop.printer, baudRate } })); }}>
                {[9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              {connected ? (
                <>
                  <Button onClick={() => run(() => printTestPage(workshop), "Test page sent")}><Printer className="h-4 w-4" /> Print test page</Button>
                  <Button variant="secondary" onClick={() => run(disconnectPrinter, "Printer disconnected")}>Disconnect</Button>
                </>
              ) : (
                <>
                  <Button onClick={() => run(() => connectPrinter(f.baudRate), "Printer connected")}><Plug className="h-4 w-4" /> Connect printer</Button>
                  <Button variant="secondary" onClick={() => run(async () => { if (!(await reconnectPrinter(f.baudRate))) throw new Error("No printer was connected before. Use Connect printer."); }, "Printer reconnected")}>
                    Reconnect last printer
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400">Printers that install as a normal Windows printer (USB printer driver) work through the Print button instead.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ActivityTab() {
  const audit = useScoped("audit");
  const look = useLookups();
  const rows = [...audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  return (
    <Card title="Activity log" bodyClassName="p-0">
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Who changed what, and when. Entries can&apos;t be edited or deleted.</p>
      <div className="max-h-[600px] overflow-auto">
        <table className={tableCls}>
          <thead><tr><th className={thCls}>When</th><th className={thCls}>Who</th><th className={thCls}>Action</th><th className={thCls}>Details</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={`${tdCls} whitespace-nowrap`}>{formatDateTime(a.at)}</td>
                <td className={tdCls}>{look.user(a.userId)?.name ?? "—"}</td>
                <td className={tdCls}><code className="text-xs">{a.action}</code></td>
                <td className={`${tdCls} text-slate-600`}>{a.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
