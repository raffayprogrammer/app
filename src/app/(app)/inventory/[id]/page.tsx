"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PartModal } from "@/components/forms";
import { attempt } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Input, Stat, tableCls, tdCls, thCls } from "@/components/ui";
import { formatDateTime, roNumber } from "@/lib/format";
import { useLookups, useStock } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { useAuthed, useScoped, useStore } from "@/lib/store";
import type { MovementReason } from "@/lib/types";

const REASON: Record<MovementReason, string> = {
  opening: "Opening stock",
  adjustment: "Adjustment",
  used_on_job: "Used on job",
  returned_from_job: "Returned from job",
};

export default function PartPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthed();
  const stock = useStock();
  const movements = useScoped("movements");
  const ros = useScoped("ros");
  const look = useLookups();
  const adjustStock = useStore((s) => s.adjustStock);
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const part = stock.find((p) => p.id === id);
  const history = useMemo(() => movements.filter((m) => m.partId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [movements, id]);

  if (!part) return <EmptyState title="Part not found" action={<Link href="/inventory"><Button variant="secondary">Inventory</Button></Link>} />;
  const canEdit = can(user.role, "inventory_edit");
  const margin = part.price > 0 ? Math.round(((part.price - part.cost) / part.price) * 100) : 0;

  const adjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (attempt(() => adjustStock(part.id, Number(qty), note), "Stock updated")) {
      setQty("");
      setNote("");
    }
  };

  return (
    <>
      <Link href="/inventory" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Inventory</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{part.name}</h1>
          <p className="text-sm text-slate-500">{part.partNumber || "No part number"} · {part.brand} · {part.category || "Uncategorised"} · bin {part.location || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {!part.active && <Badge>Inactive</Badge>}
          {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="On hand" value={part.qtyOnHand} />
        <Stat label="Reserved" value={part.reserved} hint="On approved, unfinished jobs" />
        <Stat label="Available" value={<span className={part.available <= 0 ? "text-red-600" : part.low ? "text-amber-600" : ""}>{part.available}</span>} hint={`Alert at ${part.minQty}`} />
        <Stat label="Selling price" value={formatMoney(part.price)} hint={`Cost ${formatMoney(part.cost)}`} />
        <Stat label="Margin" value={`${margin}%`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {canEdit && (
          <Card title="Adjust stock">
            <form onSubmit={adjust} className="space-y-3">
              <Field label="Quantity change" hint="Use + to add (e.g. 10 received), − to remove (e.g. −1 damaged).">
                <Input type="number" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10 or -1" required />
              </Field>
              <Field label="Reason">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Received from supplier / stock count / damaged" required />
              </Field>
              <Button type="submit" className="w-full">Save adjustment</Button>
            </form>
            <p className="mt-3 text-xs text-slate-400">Parts used on jobs come out of stock automatically when the job card is completed.</p>
          </Card>
        )}
        <Card title="Stock movements" className={canEdit ? "lg:col-span-2" : "lg:col-span-3"} bodyClassName="p-0">
          {history.length === 0 ? <EmptyState title="No movements yet" /> : (
            <div className="max-h-[480px] overflow-auto">
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Date</th><th className={thCls}>Type</th><th className={thCls}>Details</th><th className={thCls}>By</th><th className={`${thCls} text-right`}>Qty</th></tr></thead>
                <tbody>
                  {history.map((m) => {
                    const ro = m.roId ? ros.find((r) => r.id === m.roId) : undefined;
                    return (
                      <tr key={m.id}>
                        <td className={tdCls}>{formatDateTime(m.createdAt)}</td>
                        <td className={tdCls}>{REASON[m.reason]}</td>
                        <td className={`${tdCls} text-slate-600`}>
                          {ro ? <Link href={`/repair-orders/${ro.id}`} className="text-orange-700 hover:underline">{roNumber(ro.number)}</Link> : m.note}
                        </td>
                        <td className={tdCls}>{look.user(m.userId)?.name ?? "—"}</td>
                        <td className={`${tdCls} text-right font-semibold ${m.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {editing && <PartModal open onClose={() => setEditing(false)} part={part} />}
    </>
  );
}
