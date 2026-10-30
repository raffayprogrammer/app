"use client";

import { Car, Check, Plus, Search, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CustomerModal, VehicleModal } from "@/components/forms";
import { attemptResult } from "@/components/toast";
import { Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { cn, plateKey, roNumber } from "@/lib/format";
import { useScoped, useStore } from "@/lib/store";

export default function NewRepairOrderPage() {
  return (
    <Suspense>
      <NewRepairOrder />
    </Suspense>
  );
}

function NewRepairOrder() {
  const router = useRouter();
  const params = useSearchParams();
  const customers = useScoped("customers");
  const vehicles = useScoped("vehicles");
  const ros = useScoped("ros");
  const createRo = useStore((s) => s.createRo);

  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [vehicleId, setVehicleId] = useState(params.get("vehicleId") ?? "");
  const [q, setQ] = useState("");
  const [concern, setConcern] = useState("");
  const [odometer, setOdometer] = useState("");
  const [promisedAt, setPromisedAt] = useState("");
  const [modal, setModal] = useState<"customer" | "vehicle" | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = customers.find((c) => c.id === customerId);
  const custVehicles = vehicles.filter((v) => v.customerId === customerId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const pk = plateKey(term);
    const byPlate = new Set(vehicles.filter((v) => pk && plateKey(v.plate).includes(pk)).map((v) => v.customerId));
    return customers
      .filter((c) => byPlate.has(c.id) || c.name.toLowerCase().includes(term) || c.phone.replace(/\D/g, "").includes(term.replace(/\D/g, "") || "~"))
      .slice(0, 8);
  }, [q, customers, vehicles]);

  const pickCustomer = (id: string, vId?: string) => {
    setCustomerId(id);
    const own = vehicles.filter((v) => v.customerId === id);
    setVehicleId(vId ?? (own.length === 1 ? own[0].id : ""));
    setQ("");
  };

  const openRo = vehicle ? ros.find((r) => r.vehicleId === vehicle.id && ["estimate", "in_progress", "completed"].includes(r.status)) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const id = await attemptResult(
      () => createRo({
        customerId, vehicleId, concern,
        odometerIn: odometer ? Number(odometer) : vehicle?.odometer ?? null,
        promisedAt: promisedAt ? new Date(promisedAt).toISOString() : null,
      }),
      "Job card opened",
    );
    setBusy(false);
    if (id) router.push(`/repair-orders/${id}`);
  };

  return (
    <>
      <PageHeader title="New job card" subtitle="Check the car in: who it belongs to, what's wrong, and when it's needed back." />
      <form onSubmit={submit} className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="1. Customer" actions={<Button size="sm" variant="secondary" onClick={() => setModal("customer")}><UserPlus className="h-4 w-4" /> New</Button>}>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 ring-1 ring-orange-200">
                <div>
                  <p className="font-medium text-slate-900">{customer.name}</p>
                  <p className="text-sm text-slate-600">{customer.phone}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setCustomerId(""); setVehicleId(""); }}>Change</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by plate, name or phone" className="pl-9" autoFocus />
                </div>
                <ul className="mt-2 divide-y divide-slate-100">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pickCustomer(c.id)} className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-slate-50">
                        <span>
                          <span className="block text-sm font-medium text-slate-800">{c.name}</span>
                          <span className="block text-xs text-slate-500">{c.phone} · {vehicles.filter((v) => v.customerId === c.id).map((v) => v.plate).join(", ") || "no vehicles"}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {q.trim() && results.length === 0 && (
                    <li className="px-2 py-3 text-sm text-slate-500">
                      No customer found. <button type="button" className="font-medium text-orange-700 hover:underline" onClick={() => setModal("customer")}>Add a new customer</button>
                    </li>
                  )}
                </ul>
              </>
            )}
          </Card>

          <Card title="2. Vehicle" actions={customer && <Button size="sm" variant="secondary" onClick={() => setModal("vehicle")}><Plus className="h-4 w-4" /> Add</Button>}>
            {!customer ? (
              <p className="text-sm text-slate-500">Choose a customer first.</p>
            ) : custVehicles.length === 0 ? (
              <p className="text-sm text-slate-500">This customer has no vehicles yet. Add one to continue.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {custVehicles.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => { setVehicleId(v.id); setOdometer(""); }}
                    className={cn(
                      "relative rounded-lg border p-3 text-left",
                      v.id === vehicleId ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500" : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    {v.id === vehicleId && <Check className="absolute right-2 top-2 h-4 w-4 text-orange-600" />}
                    <Car className="mb-1 h-4 w-4 text-slate-400" />
                    <p className="font-semibold text-slate-900">{v.plate}</p>
                    <p className="text-sm text-slate-600">{v.make} {v.model} {v.year}</p>
                    {v.odometer !== null && <p className="text-xs text-slate-400">{v.odometer.toLocaleString()} km</p>}
                  </button>
                ))}
              </div>
            )}
            {openRo && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This car already has an open job card ({roNumber(openRo.number)}).{" "}
                <button type="button" className="font-medium underline" onClick={() => router.push(`/repair-orders/${openRo.id}`)}>Open it</button>
              </p>
            )}
          </Card>
        </div>

        <Card title="3. Check-in details">
          <div className="space-y-4">
            <Field label="Customer's complaint" hint="In the customer's words, e.g. “noise when braking”.">
              <Textarea value={concern} onChange={(e) => setConcern(e.target.value)} rows={4} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Odometer in (km)" hint={vehicle?.odometer != null ? `Last recorded ${vehicle.odometer.toLocaleString()} km` : undefined}>
                <Input type="number" min="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder={vehicle?.odometer?.toString() ?? ""} />
              </Field>
              <Field label="Promised ready by">
                <Input type="datetime-local" value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" className="w-full" disabled={!customerId || !vehicleId || !!openRo || busy}>{busy ? "Opening…" : "Open job card"}</Button>
          </div>
        </Card>
      </form>

      {modal === "customer" && <CustomerModal open onClose={() => setModal(null)} onSaved={(cId, vId) => pickCustomer(cId, vId)} />}
      {modal === "vehicle" && customer && <VehicleModal open onClose={() => setModal(null)} customerId={customer.id} onSaved={(id) => setVehicleId(id)} />}
    </>
  );
}
