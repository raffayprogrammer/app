"use client";

import { Car, FileText, Search, User, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { can } from "@/lib/permissions";
import { plateKey, roNumber } from "@/lib/format";
import { useAuthed, useScoped } from "@/lib/store";

interface Hit {
  key: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}

/** Search plates, customers, phone numbers, job cards and invoices from anywhere. */
export function GlobalSearch() {
  const router = useRouter();
  const { user } = useAuthed();
  const customers = useScoped("customers");
  const vehicles = useScoped("vehicles");
  const ros = useScoped("ros");
  const invoices = useScoped("invoices");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const pk = plateKey(term);
    const custName = (id: string) => customers.find((c) => c.id === id)?.name ?? "";
    const out: Hit[] = [];
    for (const v of vehicles) {
      if (pk && plateKey(v.plate).includes(pk)) {
        out.push({ key: v.id, href: `/customers/${v.customerId}`, icon: <Car className="h-4 w-4" />, title: v.plate, sub: `${v.make} ${v.model} · ${custName(v.customerId)}` });
      }
    }
    for (const c of customers) {
      if (c.name.toLowerCase().includes(term) || c.phone.replace(/\D/g, "").includes(term.replace(/\D/g, "") || "~")) {
        out.push({ key: c.id, href: `/customers/${c.id}`, icon: <User className="h-4 w-4" />, title: c.name, sub: c.phone });
      }
    }
    if (can(user.role, "repair_orders")) {
      for (const r of ros) {
        if (roNumber(r.number).toLowerCase().includes(term) || String(r.number) === term) {
          out.push({ key: r.id, href: `/repair-orders/${r.id}`, icon: <Wrench className="h-4 w-4" />, title: roNumber(r.number), sub: custName(r.customerId) });
        }
      }
    }
    if (can(user.role, "invoices")) {
      for (const i of invoices) {
        if (i.number.toLowerCase().includes(term)) {
          out.push({ key: i.id, href: `/invoices/${i.id}`, icon: <FileText className="h-4 w-4" />, title: i.number, sub: custName(i.customerId) });
        }
      }
    }
    return out.slice(0, 8);
  }, [q, customers, vehicles, ros, invoices, user.role]);

  const go = (h: Hit) => {
    router.push(h.href);
    setQ("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && hits[active]) go(hits[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search plate, customer, phone, RO or invoice…"
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">No matches for “{q}”.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.key + h.href}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-orange-50" : "hover:bg-slate-50"}`}
              >
                <span className="text-slate-400">{h.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">{h.title}</span>
                  <span className="block truncate text-xs text-slate-500">{h.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
