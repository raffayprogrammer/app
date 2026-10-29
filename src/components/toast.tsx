"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { create } from "zustand";
import { ActionError } from "@/lib/store";
import { cn } from "@/lib/format";

interface ToastItem {
  id: number;
  message: string;
  kind: "success" | "error";
}

const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let seq = 0;

export function toast(message: string, kind: ToastItem["kind"] = "success") {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items, { id, message, kind }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === "error" ? 5000 : 2500);
}

/**
 * Run a store action that returns a value (e.g. a new record id). A broken
 * business rule shows as an error toast and returns undefined instead of crashing.
 */
export function attemptResult<T>(fn: () => T, success?: string): T | undefined {
  try {
    const result = fn();
    if (success) toast(success);
    return result;
  } catch (e) {
    if (e instanceof ActionError) {
      toast(e.message, "error");
      return undefined;
    }
    throw e;
  }
}

/** Run a store action; true if it succeeded, false if a business rule stopped it. */
export function attempt(fn: () => unknown, success?: string): boolean {
  let ok = false;
  attemptResult(() => {
    fn();
    ok = true;
  }, success);
  return ok;
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2 print:hidden">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm shadow-lg ring-1",
            t.kind === "success" ? "bg-slate-900 text-white ring-slate-800" : "bg-red-50 text-red-800 ring-red-200",
          )}
        >
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
