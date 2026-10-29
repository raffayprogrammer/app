"use client";

import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";

/** Loads saved data from the browser once, then renders children. */
export function Hydrate({ children }: { children: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  useEffect(() => {
    Promise.resolve(useStore.persist.rehydrate()).finally(() => useStore.setState({ hydrated: true }));
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
