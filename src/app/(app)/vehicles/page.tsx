"use client";

import { Car } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RoStatusBadge } from "@/components/badges";
import { EmptyState, Input, PageHeader, tableCls, tdCls, thCls } from "@/components/ui";
import { formatDate, plateKey } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useScoped } from "@/lib/store";

export default function VehiclesPage() {
  const vehicles = useScoped("vehicles");
  const ros = useScoped("ros");
  const look = useLookups();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pk = plateKey(term);
    return vehicles
      .map((v) => {
        const visits = ros.filter((r) => r.vehicleId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { v, last: visits[0], visits: visits.length };
      })
      .filter(({ v }) =>
        !term || (pk && plateKey(v.plate).includes(pk)) || `${v.make} ${v.model}`.toLowerCase().includes(term) ||
        v.vin.toLowerCase().includes(term) || (look.customer(v.customerId)?.name.toLowerCase().includes(term) ?? false),
      )
      .sort((a, b) => a.v.plate.localeCompare(b.v.plate));
  }, [q, vehicles, ros, look]);

  return (
    <>
      <PageHeader title="Vehicles" subtitle={`${vehicles.length} vehicles on record`} />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by plate, make, model, VIN or owner" className="mb-4 max-w-md" />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState icon={<Car className="h-8 w-8" />} title={q ? "No vehicles match" : "No vehicles yet"} text="Vehicles are added from a customer's page." />
        ) : (
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Plate</th><th className={thCls}>Vehicle</th><th className={thCls}>Owner</th><th className={thCls}>Odometer</th><th className={thCls}>Visits</th><th className={thCls}>Last visit</th></tr></thead>
            <tbody>
              {rows.map(({ v, last, visits }) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className={`${tdCls} font-semibold`}>{v.plate}</td>
                  <td className={tdCls}>{v.make} {v.model} <span className="text-slate-400">{v.year}</span></td>
                  <td className={tdCls}><Link href={`/customers/${v.customerId}`} className="text-orange-700 hover:underline">{look.customer(v.customerId)?.name}</Link></td>
                  <td className={tdCls}>{v.odometer !== null ? `${v.odometer.toLocaleString()} km` : "—"}</td>
                  <td className={tdCls}>{visits}</td>
                  <td className={tdCls}>{last ? <span className="flex items-center gap-2">{formatDate(last.createdAt)} <RoStatusBadge status={last.status} /></span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
