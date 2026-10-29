"use client";

import { useState } from "react";
import { normalizePlate, plateKey } from "@/lib/format";
import { toPaisa, toRupees } from "@/lib/money";
import { ActionError, useStore } from "@/lib/store";
import type { Customer, Part, Vehicle } from "@/lib/types";
import { attemptResult } from "./toast";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

const emptyCustomer = { kind: "individual" as Customer["kind"], name: "", phone: "", email: "", address: "", ntn: "", notes: "" };
const emptyVehicle = { plate: "", make: "", model: "", year: "", vin: "", color: "", odometer: "" };

/**
 * Add or edit a customer. When adding, a first vehicle can be entered in the same
 * form because the front desk almost always registers the car at the same time.
 */
export function CustomerModal({ open, onClose, customer, onSaved }: {
  open: boolean; onClose: () => void; customer?: Customer; onSaved?: (customerId: string, vehicleId?: string) => void;
}) {
  const saveCustomer = useStore((s) => s.saveCustomer);
  const saveVehicle = useStore((s) => s.saveVehicle);
  const [c, setC] = useState(() => (customer ? { ...customer } : { ...emptyCustomer }));
  const [v, setV] = useState({ ...emptyVehicle });
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value });
  const setVeh = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const addingVehicle = !customer && v.plate.trim() !== "";
    const result = await attemptResult(async () => {
      const input = { kind: c.kind, name: c.name, phone: c.phone, email: c.email, address: c.address, ntn: c.ntn, notes: c.notes };
      // Check the vehicle first so a bad plate doesn't leave a customer half-created.
      if (addingVehicle) {
        if (!v.make.trim() || !v.model.trim()) throw new ActionError("Enter the vehicle's make and model, or clear the plate.");
        const s = useStore.getState();
        const taken = s.vehicles.some((x) => x.workshopId === s.session?.workshopId && plateKey(x.plate) === plateKey(v.plate));
        if (taken) throw new ActionError(`Plate ${normalizePlate(v.plate)} is already registered.`);
      }
      const customerId = await saveCustomer(input, customer?.id);
      let vehicleId: string | undefined;
      if (addingVehicle) {
        vehicleId = await saveVehicle({
          customerId, plate: v.plate, make: v.make, model: v.model, year: v.year, vin: v.vin, color: v.color,
          odometer: v.odometer ? Number(v.odometer) : null,
        });
      }
      return { customerId, vehicleId };
    }, customer ? "Customer updated" : "Customer added");
    if (result) {
      onSaved?.(result.customerId, result.vehicleId);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "New customer"}
      wide={!customer}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="customer-form">Save</Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Type">
            <Select value={c.kind} onChange={set("kind")}>
              <option value="individual">Individual</option>
              <option value="company">Company / fleet</option>
            </Select>
          </Field>
          <Field label={c.kind === "company" ? "Company name" : "Full name"}>
            <Input value={c.name} onChange={set("name")} required autoFocus />
          </Field>
          <Field label="Phone">
            <Input value={c.phone} onChange={set("phone")} placeholder="0300-1234567" required />
          </Field>
          <Field label="Email">
            <Input type="email" value={c.email} onChange={set("email")} />
          </Field>
          <Field label="Address">
            <Input value={c.address} onChange={set("address")} />
          </Field>
          {c.kind === "company" && (
            <Field label="NTN">
              <Input value={c.ntn} onChange={set("ntn")} />
            </Field>
          )}
          <Field label="Notes">
            <Textarea value={c.notes} onChange={set("notes")} rows={2} />
          </Field>
        </div>
        {!customer && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">First vehicle <span className="font-normal text-slate-400">(optional)</span></p>
            <Field label="Number plate">
              <Input value={v.plate} onChange={setVeh("plate")} placeholder="LEA-19-1234" className="uppercase" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Make"><Input value={v.make} onChange={setVeh("make")} placeholder="Toyota" /></Field>
              <Field label="Model"><Input value={v.model} onChange={setVeh("model")} placeholder="Corolla GLi" /></Field>
              <Field label="Year"><Input value={v.year} onChange={setVeh("year")} inputMode="numeric" /></Field>
              <Field label="Odometer (km)"><Input value={v.odometer} onChange={setVeh("odometer")} inputMode="numeric" /></Field>
            </div>
            <Field label="Chassis / VIN"><Input value={v.vin} onChange={setVeh("vin")} className="uppercase" /></Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function VehicleModal({ open, onClose, customerId, vehicle, onSaved }: {
  open: boolean; onClose: () => void; customerId: string; vehicle?: Vehicle; onSaved?: (vehicleId: string) => void;
}) {
  const saveVehicle = useStore((s) => s.saveVehicle);
  const [v, setV] = useState(() =>
    vehicle
      ? { plate: vehicle.plate, make: vehicle.make, model: vehicle.model, year: vehicle.year, vin: vehicle.vin, color: vehicle.color, odometer: vehicle.odometer?.toString() ?? "" }
      : { ...emptyVehicle },
  );
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await attemptResult(
      () => saveVehicle({ customerId, plate: v.plate, make: v.make, model: v.model, year: v.year, vin: v.vin, color: v.color, odometer: v.odometer ? Number(v.odometer) : null }, vehicle?.id),
      vehicle ? "Vehicle updated" : "Vehicle added",
    );
    if (id) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.plate}` : "Add vehicle"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="vehicle-form">Save</Button>
        </>
      }
    >
      <form id="vehicle-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Number plate" className="col-span-2">
          <Input value={v.plate} onChange={set("plate")} placeholder="LEA-19-1234" className="uppercase" required autoFocus />
        </Field>
        <Field label="Make"><Input value={v.make} onChange={set("make")} required /></Field>
        <Field label="Model"><Input value={v.model} onChange={set("model")} required /></Field>
        <Field label="Year"><Input value={v.year} onChange={set("year")} inputMode="numeric" /></Field>
        <Field label="Colour"><Input value={v.color} onChange={set("color")} /></Field>
        <Field label="Odometer (km)"><Input value={v.odometer} onChange={set("odometer")} inputMode="numeric" /></Field>
        <Field label="Chassis / VIN"><Input value={v.vin} onChange={set("vin")} className="uppercase" /></Field>
      </form>
    </Modal>
  );
}

export function PartModal({ open, onClose, part, onSaved }: { open: boolean; onClose: () => void; part?: Part; onSaved?: (id: string) => void }) {
  const savePart = useStore((s) => s.savePart);
  const [f, setF] = useState(() => ({
    partNumber: part?.partNumber ?? "", name: part?.name ?? "", brand: part?.brand ?? "", category: part?.category ?? "",
    location: part?.location ?? "", cost: part ? String(toRupees(part.cost)) : "", price: part ? String(toRupees(part.price)) : "",
    minQty: part ? String(part.minQty) : "2", openingQty: "0", active: part?.active ?? true,
  }));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const cost = Number(f.cost || 0);
  const price = Number(f.price || 0);
  const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = await attemptResult(
      () => savePart({
        partNumber: f.partNumber, name: f.name, brand: f.brand, category: f.category, location: f.location,
        cost: toPaisa(f.cost || 0), price: toPaisa(f.price || 0), minQty: Math.max(0, Math.floor(Number(f.minQty || 0))),
        active: f.active, openingQty: Number(f.openingQty || 0),
      }, part?.id),
      part ? "Part updated" : "Part added",
    );
    if (id) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={part ? "Edit part" : "New part"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="part-form">Save</Button>
        </>
      }
    >
      <form id="part-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Part name" className="col-span-2"><Input value={f.name} onChange={set("name")} required autoFocus /></Field>
        <Field label="Part number"><Input value={f.partNumber} onChange={set("partNumber")} /></Field>
        <Field label="Brand"><Input value={f.brand} onChange={set("brand")} /></Field>
        <Field label="Category"><Input value={f.category} onChange={set("category")} placeholder="Filters, Brakes…" /></Field>
        <Field label="Shelf / bin"><Input value={f.location} onChange={set("location")} placeholder="A-1" /></Field>
        <Field label="Cost price (Rs)"><Input type="number" min="0" step="0.01" value={f.cost} onChange={set("cost")} /></Field>
        <Field label="Selling price (Rs)" hint={price > 0 ? `Margin ${margin}%` : undefined}>
          <Input type="number" min="0" step="0.01" value={f.price} onChange={set("price")} required />
        </Field>
        <Field label="Low-stock alert at"><Input type="number" min="0" value={f.minQty} onChange={set("minQty")} /></Field>
        {part ? (
          <label className="mt-6 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active
          </label>
        ) : (
          <Field label="Opening stock"><Input type="number" min="0" value={f.openingQty} onChange={set("openingQty")} /></Field>
        )}
      </form>
    </Modal>
  );
}
