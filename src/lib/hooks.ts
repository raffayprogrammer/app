"use client";

import { useMemo } from "react";
import { reservedQty } from "./calc";
import { useScoped } from "./store";
import type { Part } from "./types";

/** Id -> record lookups for the signed-in workshop. */
export function useLookups() {
  const customers = useScoped("customers");
  const vehicles = useScoped("vehicles");
  const users = useScoped("users");
  const parts = useScoped("parts");
  return useMemo(() => {
    const c = new Map(customers.map((x) => [x.id, x]));
    const v = new Map(vehicles.map((x) => [x.id, x]));
    const u = new Map(users.map((x) => [x.id, x]));
    const p = new Map(parts.map((x) => [x.id, x]));
    return {
      customer: (id: string | null | undefined) => (id ? c.get(id) : undefined),
      vehicle: (id: string | null | undefined) => (id ? v.get(id) : undefined),
      user: (id: string | null | undefined) => (id ? u.get(id) : undefined),
      part: (id: string | null | undefined) => (id ? p.get(id) : undefined),
    };
  }, [customers, vehicles, users, parts]);
}

export interface StockRow extends Part {
  reserved: number;
  available: number;
  low: boolean;
}

/** Parts with reserved / available quantities worked out from open job cards. */
export function useStock(): StockRow[] {
  const parts = useScoped("parts");
  const ros = useScoped("ros");
  return useMemo(
    () =>
      parts.map((p) => {
        const reserved = reservedQty(p.id, ros);
        const available = p.qtyOnHand - reserved;
        return { ...p, reserved, available, low: p.active && available <= p.minQty };
      }),
    [parts, ros],
  );
}
