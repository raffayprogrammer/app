"use client";

import { ArrowLeft, Ban, Printer, Receipt, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { InvoiceBadge } from "@/components/badges";
import { InvoiceDocument } from "@/components/invoice-document";
import { attempt, toast } from "@/components/toast";
import { Button, Card, EmptyState, Field, Input, Modal, Textarea } from "@/components/ui";
import { invoiceBalance } from "@/lib/calc";
import { cn, formatDateTime, roNumber } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { PAYMENT_METHOD } from "@/lib/meta";
import { formatMoney, toPaisa, toRupees } from "@/lib/money";
import { can } from "@/lib/permissions";
import { printReceipt, usePrinterConnected } from "@/lib/printer";
import { useAuthed, useScoped, useStore } from "@/lib/store";
import type { Invoice, PaymentMethod } from "@/lib/types";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { user, workshop } = useAuthed();
  const invoices = useScoped("invoices");
  const allPayments = useScoped("payments");
  const ros = useScoped("ros");
  const look = useLookups();
  const voidInvoice = useStore((s) => s.voidInvoice);
  const printerConnected = usePrinterConnected();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const inv = invoices.find((i) => i.id === id);
  if (!inv) return <EmptyState title="Invoice not found" action={<Link href="/invoices"><Button variant="secondary">All invoices</Button></Link>} />;

  const payments = allPayments.filter((p) => p.invoiceId === inv.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const ro = ros.find((r) => r.id === inv.roId);
  const balance = invoiceBalance(inv, allPayments);
  const customer = look.customer(inv.customerId);
  const vehicle = look.vehicle(inv.vehicleId);

  const thermalPrint = async (current: Invoice = inv) => {
    try {
      const pays = useStore.getState().payments.filter((p) => p.invoiceId === current.id);
      await printReceipt({ workshop, invoice: current, roNumberValue: ro?.number ?? 0, customer, vehicle, payments: pays });
      toast("Receipt sent to printer");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Printing failed", "error");
    }
  };

  const afterPayment = () => {
    if (!workshop.printer.autoPrintAfterPayment) return;
    const latest = useStore.getState().invoices.find((i) => i.id === inv.id) ?? inv;
    if (printerConnected) void thermalPrint(latest);
    else window.open(`/print/invoice/${inv.id}?auto=1`, "_blank");
  };

  return (
    <>
      <Link href="/invoices" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Invoices</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{inv.number}</h1>
            <InvoiceBadge status={inv.status} />
          </div>
          <p className="text-sm text-slate-500">
            {customer?.name} · {vehicle?.plate} · issued {formatDateTime(inv.issuedAt)}
            {ro && <> · <Link href={`/repair-orders/${ro.id}`} className="text-orange-700 hover:underline">{roNumber(ro.number)}</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/invoice/${inv.id}?auto=1`} target="_blank">
            <Button variant="secondary"><Printer className="h-4 w-4" /> Print</Button>
          </Link>
          {printerConnected && (
            <Button variant="secondary" onClick={() => thermalPrint()}><Receipt className="h-4 w-4" /> Receipt printer</Button>
          )}
          {can(user.role, "void_invoice") && inv.status !== "void" && payments.length === 0 && (
            <Button variant="ghost" onClick={() => setVoiding(true)}><Ban className="h-4 w-4" /> Void</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="min-w-[640px]">
            <InvoiceDocument
              kind="invoice" number={inv.number} date={inv.issuedAt} workshop={workshop} customer={customer} vehicle={vehicle}
              roNumberValue={ro?.number ?? 0} odometer={ro?.odometerIn} lines={inv.lines} totals={inv.totals}
              partsTaxRate={inv.partsTaxRate} laborTaxRate={inv.laborTaxRate} payments={payments} status={inv.status} voidReason={inv.voidReason}
            />
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Balance due</p>
            <p className={cn("mt-1 text-3xl font-bold", balance > 0 ? "text-slate-900" : "text-emerald-600")}>{formatMoney(balance)}</p>
            <p className="text-sm text-slate-500">of {formatMoney(inv.totals.total)}</p>
          </Card>
          {inv.status !== "void" && balance > 0 && can(user.role, "payments") && (
            <PaymentForm invoiceId={inv.id} balance={balance} onPaid={afterPayment} />
          )}
          <Card title="Payments" bodyClassName="p-0">
            {payments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{PAYMENT_METHOD[p.method]}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(p.receivedAt)} · {look.user(p.userId)?.name}{p.reference ? ` · ${p.reference}` : ""}</p>
                    </div>
                    <span className="font-semibold">{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {ro && (
            <Link href={`/repair-orders/${ro.id}`} className="flex items-center gap-2 text-sm text-slate-500 hover:text-orange-700">
              <Wrench className="h-4 w-4" /> Open job card {roNumber(ro.number)}
            </Link>
          )}
        </div>
      </div>

      <Modal
        open={voiding}
        onClose={() => setVoiding(false)}
        title={`Void ${inv.number}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoiding(false)}>Keep invoice</Button>
            <Button variant="danger" onClick={() => attempt(() => voidInvoice(inv.id, reason), "Invoice voided") && setVoiding(false)}>Void invoice</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          The invoice number stays used and the invoice is kept on record as <b>Void</b>. The job card goes back to <b>Completed</b> so a corrected invoice can be issued.
        </p>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong customer selected" /></Field>
      </Modal>
    </>
  );
}

const METHODS: PaymentMethod[] = ["cash", "card", "bank", "jazzcash", "easypaisa", "other"];

function PaymentForm({ invoiceId, balance, onPaid }: { invoiceId: string; balance: number; onPaid: () => void }) {
  const addPayment = useStore((s) => s.addPayment);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(String(toRupees(balance)));
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const amt = toPaisa(amount || 0);
  const change = method === "cash" && tendered ? toPaisa(tendered) - amt : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === "cash" && tendered && toPaisa(tendered) < amt) return toast("Cash received is less than the amount.", "error");
    const ok = attempt(() => addPayment(invoiceId, { method, amount: amt, reference }), amt === balance ? "Paid in full" : "Part payment recorded");
    if (ok) {
      setTendered("");
      setReference("");
      onPaid();
      const left = balance - amt;
      setAmount(String(toRupees(Math.max(left, 0))));
    }
  };

  return (
    <Card title="Take payment">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMethod(m)}
              className={cn(
                "rounded-lg border px-2 py-2 text-xs font-medium",
                method === m ? "border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-500" : "border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              {PAYMENT_METHOD[m]}
            </button>
          ))}
        </div>
        <Field label="Amount (Rs)" hint="Less than the balance = part payment. Add more payments to split across methods.">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        {method === "cash" ? (
          <Field label="Cash received (Rs)" hint={change > 0 ? `Change to give: ${formatMoney(change)}` : undefined}>
            <Input type="number" min="0" step="1" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="Optional" />
          </Field>
        ) : (
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID / last 4 digits" />
          </Field>
        )}
        <Button type="submit" variant="success" className="w-full">Receive {formatMoney(amt)}</Button>
      </form>
    </Card>
  );
}
