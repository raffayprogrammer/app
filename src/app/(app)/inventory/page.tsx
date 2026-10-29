"use client";

import { Download, Package, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { PartModal } from "@/components/forms";
import { Badge, Button, EmptyState, Input, PageHeader, Select, Stat, tableCls, tdCls, thCls } from "@/components/ui";
import { cn, downloadCsv } from "@/lib/format";
import { useStock } from "@/lib/hooks";
import { formatMoney, toRupees } from "@/lib/money";
import { can } from "@/lib/permissions";
import { useAuthed } from "@/lib/store";

export default function InventoryPage() {
  return (
    <Suspense>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuthed();
  const stock = useStock();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(params.get("filter") === "low" ? "low" : "all");
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const canEdit = can(user.role, "inventory_edit");

  const categories = useMemo(() => [...new Set(stock.map((p) => p.category).filter(Boolean))].sort(), [stock]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stock
      .filter((p) => (filter === "inactive" ? !p.active : p.active))
      .filter((p) => filter !== "low" || p.low)
      .filter((p) => !category || p.category === category)
      .filter((p) => !term || [p.name, p.partNumber, p.brand, p.location].some((x) => x.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stock, q, filter, category]);

  const active = stock.filter((p) => p.active);
  const stockValue = active.reduce((s, p) => s + p.qtyOnHand * p.cost, 0);

  const exportCsv = () =>
    downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Part number", "Name", "Brand", "Category", "Bin", "On hand", "Reserved", "Available", "Min", "Cost (Rs)", "Price (Rs)"],
      ...rows.map((p) => [p.partNumber, p.name, p.brand, p.category, p.location, p.qtyOnHand, p.reserved, p.available, p.minQty, toRupees(p.cost), toRupees(p.price)]),
    ]);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Parts stock. Reserved = on approved jobs not yet completed."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {canEdit && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New part</Button>}
          </>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Active parts" value={active.length} />
        <Stat label="Low or out of stock" value={<span className="text-amber-600">{active.filter((p) => p.low).length}</span>} />
        <Stat label="Stock value (at cost)" value={formatMoney(stockValue)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, part number, brand, bin" className="w-full sm:w-72" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
          <option value="all">All active</option>
          <option value="low">Low / out of stock</option>
          <option value="inactive">Inactive</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState icon={<Package className="h-8 w-8" />} title="No parts found" action={canEdit && <Button onClick={() => setAdding(true)}>Add part</Button>} />
        ) : (
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Part</th><th className={thCls}>Brand</th><th className={thCls}>Bin</th>
                <th className={`${thCls} text-right`}>On hand</th><th className={`${thCls} text-right`}>Reserved</th>
                <th className={`${thCls} text-right`}>Available</th><th className={`${thCls} text-right`}>Price</th><th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/inventory/${p.id}`)}>
                  <td className={tdCls}>
                    <Link href={`/inventory/${p.id}`} className="font-medium text-slate-900 hover:text-orange-700">{p.name}</Link>
                    <p className="text-xs text-slate-500">{p.partNumber || "—"} · {p.category || "Uncategorised"}</p>
                  </td>
                  <td className={tdCls}>{p.brand}</td>
                  <td className={tdCls}>{p.location || "—"}</td>
                  <td className={`${tdCls} text-right`}>{p.qtyOnHand}</td>
                  <td className={`${tdCls} text-right text-slate-500`}>{p.reserved || "—"}</td>
                  <td className={cn(tdCls, "text-right font-semibold", p.available <= 0 ? "text-red-600" : p.low ? "text-amber-600" : "text-slate-900")}>{p.available}</td>
                  <td className={`${tdCls} text-right`}>{formatMoney(p.price)}</td>
                  <td className={tdCls}>
                    {!p.active ? <Badge>Inactive</Badge> : p.available <= 0 ? <Badge tone="red">Out of stock</Badge> : p.low ? <Badge tone="amber">Low</Badge> : <Badge tone="green">OK</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <PartModal open onClose={() => setAdding(false)} onSaved={(id) => router.push(`/inventory/${id}`)} />}
    </>
  );
}
