"use client";

import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";

/** Restores the signed-in session and loads the workshop's data once, then renders children. */
export function Hydrate({ children }: { children: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  useEffect(() => {
    void useStore.getState().init();
  }, []);
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading WorkshopPOS…
      </div>
    );
  }
  return <>{children}</>;
}
