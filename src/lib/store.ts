"use client";

// Demo-mode data layer. All reads and writes go through this store; every rule
// (stock, numbering, payments, permissions, audit) lives in these actions so the
// same rules can be moved into Supabase functions later.

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { approvedJobs, approvedPartUsage, computeTotals, invoiceBalance, lineAmount, paidAmount } from "./calc";
import { normalizePlate, nowIso, plateKey, uid } from "./format";
import { can, type Permission } from "./permissions";
import { buildDemoData, defaultWorkshop, starterCannedJobs } from "./seed";
import type {
  Approval, AuditEntry, CannedJob, Customer, Data, Invoice, Job, Line, Part, Payment, PaymentMethod, RepairOrder, Role,
  Session, User, Vehicle, Workshop,
} from "./types";

export class ActionError extends Error {}
const fail = (msg: string): never => {
  throw new ActionError(msg);
};

type CustomerInput = Omit<Customer, "id" | "workshopId" | "createdAt">;
type VehicleInput = Omit<Vehicle, "id" | "workshopId" | "createdAt">;
type PartInput = Omit<Part, "id" | "workshopId" | "createdAt" | "qtyOnHand">;

interface Actions {
  login: (email: string, password: string) => User;
  loginAs: (userId: string) => User;
  logout: () => void;
  signup: (input: { workshopName: string; city: string; phone: string; ownerName: string; email: string; password: string }) => User;
  resetDemo: () => void;

  updateWorkshop: (patch: Partial<Omit<Workshop, "id" | "nextInvoiceSeq" | "nextRoSeq" | "createdAt">>) => void;
  addUser: (input: { name: string; email: string; password: string; role: Role }) => void;
  updateUser: (id: string, patch: Partial<Pick<User, "name" | "role" | "active" | "password">>) => void;

  saveCustomer: (input: CustomerInput, id?: string) => string;
  saveVehicle: (input: VehicleInput, id?: string) => string;

  savePart: (input: PartInput & { openingQty?: number }, id?: string) => string;
  adjustStock: (partId: string, qty: number, note: string) => void;

  saveCannedJob: (input: Omit<CannedJob, "id" | "workshopId">, id?: string) => void;
  deleteCannedJob: (id: string) => void;

  createRo: (input: { customerId: string; vehicleId: string; concern: string; odometerIn: number | null; promisedAt: string | null; technicianId: string | null }) => string;
  updateRo: (id: string, patch: Partial<Pick<RepairOrder, "concern" | "notes" | "odometerIn" | "promisedAt" | "technicianId" | "label" | "discount">>) => void;
  addJob: (roId: string, title: string) => void;
  addCannedJobToRo: (roId: string, cannedId: string) => void;
  updateJob: (roId: string, jobId: string, patch: Partial<Pick<Job, "title" | "done">>) => void;
  removeJob: (roId: string, jobId: string) => void;
  setJobApproval: (roId: string, jobId: string, approval: Approval) => void;
  addLine: (roId: string, jobId: string, line: Omit<Line, "id">) => void;
  updateLine: (roId: string, jobId: string, lineId: string, patch: Partial<Omit<Line, "id" | "kind" | "partId">>) => void;
  removeLine: (roId: string, jobId: string, lineId: string) => void;
  completeWork: (roId: string) => void;
  reopenRo: (roId: string) => void;
  cancelRo: (roId: string, reason: string) => void;

  createInvoice: (roId: string) => string;
  voidInvoice: (invoiceId: string, reason: string) => void;
  addPayment: (invoiceId: string, input: { method: PaymentMethod; amount: number; reference: string }) => void;
}

export type State = Data & { session: Session | null; hydrated: boolean } & Actions;

const EDITABLE: RepairOrder["status"][] = ["estimate", "in_progress"];

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Current user + workshop, after checking an optional permission. */
      const ctx = (perm?: Permission) => {
        const s = get();
        const user = s.users.find((u) => u.id === s.session?.userId);
        const ws = s.workshops.find((w) => w.id === s.session?.workshopId);
        if (!user || !ws) return fail("You are signed out. Please sign in again.");
        if (perm && !can(user.role, perm)) fail("You don't have permission to do that.");
        return { s, user, ws };
      };

      const log = (user: User, action: string, entity: string, entityId: string, summary: string): AuditEntry => ({
        id: uid(), workshopId: user.workshopId, userId: user.id, action, entity, entityId, summary, at: nowIso(),
      });

      const findRo = (s: State, id: string, wsId: string) =>
        s.ros.find((r) => r.id === id && r.workshopId === wsId) ?? fail("Job card not found.");

      /** Apply a change to one repair order and record it in the audit log. */
      const patchRo = (
        roId: string,
        perm: Permission,
        fn: (ro: RepairOrder) => RepairOrder,
        audit?: [string, string],
      ) => {
        const { s, user, ws } = ctx(perm);
        const ro = findRo(s, roId, ws.id);
        const next = { ...fn(ro), updatedAt: nowIso() };
        set({
          ros: s.ros.map((r) => (r.id === roId ? next : r)),
          ...(audit ? { audit: [...s.audit, log(user, audit[0], "repair_order", roId, audit[1])] } : {}),
        });
      };

      const editableJobs = (ro: RepairOrder, fn: (jobs: Job[]) => Job[]): RepairOrder => {
        if (!EDITABLE.includes(ro.status)) fail("This job card is closed for editing. Reopen it first.");
        return { ...ro, jobs: fn(ro.jobs) };
      };

      const emailTaken = (email: string, exceptId?: string) =>
        get().users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== exceptId);

      return {
        ...buildDemoData(),
        session: null,
        hydrated: false,

        // ---- Auth (demo) ----------------------------------------------------------
        login: (email, password) => {
          const user = get().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
          if (!user || user.password !== password) return fail("Wrong email or password.");
          if (!user.active) return fail("This account has been deactivated. Ask the workshop owner.");
          set({ session: { userId: user.id, workshopId: user.workshopId } });
          return user;
        },
        loginAs: (userId) => {
          const user = get().users.find((u) => u.id === userId) ?? fail("User not found.");
          set({ session: { userId: user.id, workshopId: user.workshopId } });
          return user;
        },
        logout: () => set({ session: null }),
        signup: (input) => {
          if (!input.workshopName.trim() || !input.ownerName.trim()) fail("Workshop name and your name are required.");
          if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fail("Enter a valid email address.");
          if (input.password.length < 6) fail("Password must be at least 6 characters.");
          if (emailTaken(input.email)) fail("An account with this email already exists.");
          const ws = defaultWorkshop({ name: input.workshopName.trim(), city: input.city.trim(), phone: input.phone.trim(), email: input.email.trim() });
          const owner: User = {
            id: uid(), workshopId: ws.id, name: input.ownerName.trim(), email: input.email.trim(), password: input.password,
            role: "owner", active: true, createdAt: nowIso(),
          };
          const s = get();
          set({
            workshops: [...s.workshops, ws],
            users: [...s.users, owner],
            cannedJobs: [...s.cannedJobs, ...starterCannedJobs(ws)],
            audit: [...s.audit, log(owner, "workshop.created", "workshop", ws.id, `Workshop "${ws.name}" created`)],
            session: { userId: owner.id, workshopId: ws.id },
          });
          return owner;
        },
        resetDemo: () => set({ ...buildDemoData(), session: null }),

        // ---- Settings -------------------------------------------------------------
        updateWorkshop: (patch) => {
          const { s, user, ws } = ctx("settings");
          if (patch.partsTaxRate !== undefined && (patch.partsTaxRate < 0 || patch.partsTaxRate > 100)) fail("Tax rate must be 0–100%.");
          if (patch.laborTaxRate !== undefined && (patch.laborTaxRate < 0 || patch.laborTaxRate > 100)) fail("Tax rate must be 0–100%.");
          set({
            workshops: s.workshops.map((w) => (w.id === ws.id ? { ...w, ...patch } : w)),
            audit: [...s.audit, log(user, "settings.updated", "workshop", ws.id, `Updated: ${Object.keys(patch).join(", ")}`)],
          });
        },
        addUser: (input) => {
          const { s, user, ws } = ctx("users");
          if (!input.name.trim()) fail("Name is required.");
          if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fail("Enter a valid email address.");
          if (input.password.length < 6) fail("Password must be at least 6 characters.");
          if (emailTaken(input.email)) fail("An account with this email already exists.");
          const nu: User = { id: uid(), workshopId: ws.id, name: input.name.trim(), email: input.email.trim(), password: input.password, role: input.role, active: true, createdAt: nowIso() };
          set({ users: [...s.users, nu], audit: [...s.audit, log(user, "user.created", "user", nu.id, `Added ${nu.name} (${nu.role})`)] });
        },
        updateUser: (id, patch) => {
          const { s, user, ws } = ctx("users");
          const target = s.users.find((u) => u.id === id && u.workshopId === ws.id) ?? fail("User not found.");
          const owners = s.users.filter((u) => u.workshopId === ws.id && u.role === "owner" && u.active);
          const losesOwner = target.role === "owner" && ((patch.role && patch.role !== "owner") || patch.active === false);
          if (losesOwner && owners.length <= 1) fail("A workshop must keep at least one active owner.");
          set({
            users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
            audit: [...s.audit, log(user, "user.updated", "user", id, `Updated ${target.name}: ${Object.keys(patch).join(", ")}`)],
          });
        },

        // ---- Customers & vehicles ---------------------------------------------------
        saveCustomer: (input, id) => {
          const { s, user, ws } = ctx("customers");
          if (!input.name.trim()) fail("Customer name is required.");
          if (!input.phone.trim()) fail("Phone number is required.");
          const clean = { ...input, name: input.name.trim(), phone: input.phone.trim() };
          if (id) {
            set({
              customers: s.customers.map((c) => (c.id === id && c.workshopId === ws.id ? { ...c, ...clean } : c)),
              audit: [...s.audit, log(user, "customer.updated", "customer", id, `Updated ${clean.name}`)],
            });
            return id;
          }
          const c: Customer = { ...clean, id: uid(), workshopId: ws.id, createdAt: nowIso() };
          set({ customers: [...s.customers, c], audit: [...s.audit, log(user, "customer.created", "customer", c.id, `Added ${c.name}`)] });
          return c.id;
        },
        saveVehicle: (input, id) => {
          const { s, user, ws } = ctx("vehicles");
          const plate = normalizePlate(input.plate);
          if (!plate) fail("Number plate is required.");
          if (!input.make.trim() || !input.model.trim()) fail("Make and model are required.");
          const dupe = s.vehicles.find((v) => v.workshopId === ws.id && plateKey(v.plate) === plateKey(plate) && v.id !== id);
          if (dupe) fail(`Plate ${plate} is already registered to another vehicle.`);
          const clean = { ...input, plate, make: input.make.trim(), model: input.model.trim(), vin: input.vin.trim().toUpperCase() };
          if (id) {
            set({
              vehicles: s.vehicles.map((v) => (v.id === id && v.workshopId === ws.id ? { ...v, ...clean } : v)),
              audit: [...s.audit, log(user, "vehicle.updated", "vehicle", id, `Updated ${plate}`)],
            });
            return id;
          }
          const v: Vehicle = { ...clean, id: uid(), workshopId: ws.id, createdAt: nowIso() };
          set({ vehicles: [...s.vehicles, v], audit: [...s.audit, log(user, "vehicle.created", "vehicle", v.id, `Added ${plate}`)] });
          return v.id;
        },

        // ---- Inventory -------------------------------------------------------------
        savePart: ({ openingQty, ...input }, id) => {
          const { s, user, ws } = ctx("inventory_edit");
          if (!input.name.trim()) fail("Part name is required.");
          if (input.price < 0 || input.cost < 0) fail("Prices can't be negative.");
          const dupe = input.partNumber.trim() && s.parts.find(
            (p) => p.workshopId === ws.id && p.id !== id && p.partNumber.toLowerCase() === input.partNumber.trim().toLowerCase(),
          );
          if (dupe) fail(`Part number ${input.partNumber} already exists (${dupe.name}).`);
          const clean = { ...input, name: input.name.trim(), partNumber: input.partNumber.trim() };
          if (id) {
            set({
              parts: s.parts.map((p) => (p.id === id && p.workshopId === ws.id ? { ...p, ...clean } : p)),
              audit: [...s.audit, log(user, "part.updated", "part", id, `Updated ${clean.name}`)],
            });
            return id;
          }
          const qty = Math.max(0, Math.floor(openingQty ?? 0));
          const p: Part = { ...clean, id: uid(), workshopId: ws.id, qtyOnHand: qty, createdAt: nowIso() };
          set({
            parts: [...s.parts, p],
            movements: qty
              ? [...s.movements, { id: uid(), workshopId: ws.id, partId: p.id, qty, reason: "opening", note: "Opening stock", userId: user.id, createdAt: nowIso() }]
              : s.movements,
            audit: [...s.audit, log(user, "part.created", "part", p.id, `Added ${p.name}`)],
          });
          return p.id;
        },
        adjustStock: (partId, qty, note) => {
          const { s, user, ws } = ctx("inventory_edit");
          const p = s.parts.find((x) => x.id === partId && x.workshopId === ws.id) ?? fail("Part not found.");
          if (!Number.isInteger(qty) || qty === 0) fail("Enter a whole number other than zero.");
          if (!note.trim()) fail("Add a reason for the stock change.");
          if (p.qtyOnHand + qty < 0) fail(`Only ${p.qtyOnHand} in stock — can't remove ${-qty}.`);
          set({
            parts: s.parts.map((x) => (x.id === partId ? { ...x, qtyOnHand: x.qtyOnHand + qty } : x)),
            movements: [...s.movements, { id: uid(), workshopId: ws.id, partId, qty, reason: "adjustment", note: note.trim(), userId: user.id, createdAt: nowIso() }],
            audit: [...s.audit, log(user, "stock.adjusted", "part", partId, `${qty > 0 ? "+" : ""}${qty} ${p.name}: ${note.trim()}`)],
          });
        },

        saveCannedJob: (input, id) => {
          const { s, user, ws } = ctx("settings");
          if (!input.title.trim()) fail("Give the canned job a name.");
          if (!input.lines.length) fail("Add at least one line.");
          const cj: CannedJob = { ...input, title: input.title.trim(), id: id ?? uid(), workshopId: ws.id };
          set({
            cannedJobs: id ? s.cannedJobs.map((c) => (c.id === id ? cj : c)) : [...s.cannedJobs, cj],
            audit: [...s.audit, log(user, id ? "canned_job.updated" : "canned_job.created", "canned_job", cj.id, cj.title)],
          });
        },
        deleteCannedJob: (id) => {
          const { s, user, ws } = ctx("settings");
          const cj = s.cannedJobs.find((c) => c.id === id && c.workshopId === ws.id) ?? fail("Canned job not found.");
          set({
            cannedJobs: s.cannedJobs.filter((c) => c.id !== id),
            audit: [...s.audit, log(user, "canned_job.deleted", "canned_job", id, cj.title)],
          });
        },

        // ---- Repair orders -----------------------------------------------------------
        createRo: (input) => {
          const { s, user, ws } = ctx("repair_orders");
          const vehicle = s.vehicles.find((v) => v.id === input.vehicleId && v.workshopId === ws.id) ?? fail("Choose a vehicle.");
          if (vehicle.customerId !== input.customerId) fail("That vehicle belongs to a different customer.");
          const open = s.ros.find((r) => r.vehicleId === vehicle.id && ["estimate", "in_progress", "completed"].includes(r.status));
          if (open) fail(`This vehicle already has an open job card (RO-${open.number}).`);
          if (input.odometerIn !== null && vehicle.odometer !== null && input.odometerIn < vehicle.odometer) {
            fail(`Odometer can't go backwards (last recorded ${vehicle.odometer.toLocaleString()} km).`);
          }
          const ro: RepairOrder = {
            id: uid(), workshopId: ws.id, number: ws.nextRoSeq, customerId: input.customerId, vehicleId: vehicle.id,
            status: "estimate", label: "none", technicianId: input.technicianId, concern: input.concern.trim(), notes: "",
            odometerIn: input.odometerIn, promisedAt: input.promisedAt, jobs: [], discount: 0, stockDeducted: false,
            invoiceId: null, createdBy: user.id, createdAt: nowIso(), updatedAt: nowIso(), completedAt: null,
          };
          set({
            ros: [...s.ros, ro],
            workshops: s.workshops.map((w) => (w.id === ws.id ? { ...w, nextRoSeq: w.nextRoSeq + 1 } : w)),
            vehicles: input.odometerIn !== null ? s.vehicles.map((v) => (v.id === vehicle.id ? { ...v, odometer: input.odometerIn } : v)) : s.vehicles,
            audit: [...s.audit, log(user, "ro.created", "repair_order", ro.id, `RO-${ro.number} opened for ${vehicle.plate}`)],
          });
          return ro.id;
        },
        updateRo: (id, patch) => {
          const { s, user, ws } = ctx();
          if (user.role === "technician" && findRo(s, id, ws.id).technicianId !== user.id) fail("This car isn't assigned to you.");
          const perm: Permission = Object.keys(patch).every((k) => k === "label") && user.role === "technician" ? "my_work" : "repair_orders";
          if (patch.discount !== undefined) {
            if (!can(user.role, "discount")) fail("You don't have permission to give discounts.");
            if (patch.discount < 0) fail("Discount can't be negative.");
          }
          patchRo(id, perm, (ro) => {
            if (patch.discount !== undefined && !EDITABLE.includes(ro.status)) fail("Discount can only change before work is completed.");
            return { ...ro, ...patch };
          }, patch.discount !== undefined ? ["ro.discount", `Discount set`] : undefined);
        },
        addJob: (roId, title) => {
          if (!title.trim()) fail("Give the job a name.");
          patchRo(roId, "repair_orders", (ro) => editableJobs(ro, (jobs) => [...jobs, { id: uid(), title: title.trim(), approval: "pending", done: false, lines: [] }]));
        },
        addCannedJobToRo: (roId, cannedId) => {
          const { s, ws } = ctx("repair_orders");
          const cj = s.cannedJobs.find((c) => c.id === cannedId && c.workshopId === ws.id) ?? fail("Canned job not found.");
          // Re-price parts from today's price list rather than the price saved in the template.
          const lines = cj.lines.map((l) => {
            const p = l.partId ? s.parts.find((x) => x.id === l.partId) : undefined;
            return { ...l, id: uid(), unitPrice: p ? p.price : l.unitPrice, description: p ? p.name : l.description };
          });
          patchRo(roId, "repair_orders", (ro) => editableJobs(ro, (jobs) => [...jobs, { id: uid(), title: cj.title, approval: "pending", done: false, lines }]));
        },
        updateJob: (roId, jobId, patch) => {
          const { s, user, ws } = ctx();
          if (user.role === "technician" && findRo(s, roId, ws.id).technicianId !== user.id) fail("This car isn't assigned to you.");
          const techOnly = Object.keys(patch).every((k) => k === "done");
          patchRo(roId, techOnly && user.role === "technician" ? "my_work" : "repair_orders", (ro) => {
            if (patch.title !== undefined && !patch.title.trim()) fail("Job name can't be empty.");
            if (patch.done !== undefined && ro.status !== "in_progress") fail("Jobs can only be ticked off while work is in progress.");
            if (patch.title !== undefined && !EDITABLE.includes(ro.status)) fail("This job card is closed for editing.");
            return { ...ro, jobs: ro.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) };
          });
        },
        removeJob: (roId, jobId) => patchRo(roId, "repair_orders", (ro) => editableJobs(ro, (jobs) => jobs.filter((j) => j.id !== jobId))),
        setJobApproval: (roId, jobId, approval) => {
          patchRo(roId, "repair_orders", (ro) => {
            const next = editableJobs(ro, (jobs) => jobs.map((j) => (j.id === jobId ? { ...j, approval, done: approval === "approved" ? j.done : false } : j)));
            const anyApproved = next.jobs.some((j) => j.approval === "approved");
            // The card moves itself: first approval starts work, losing every approval sends it back to estimate.
            if (next.status === "estimate" && anyApproved) next.status = "in_progress";
            if (next.status === "in_progress" && !anyApproved) next.status = "estimate";
            return next;
          }, ["ro.approval", `Job ${approval}`]);
        },
        addLine: (roId, jobId, line) => {
          if (line.qty <= 0) fail("Quantity must be more than zero.");
          if (line.unitPrice < 0) fail("Price can't be negative.");
          patchRo(roId, "repair_orders", (ro) =>
            editableJobs(ro, (jobs) => jobs.map((j) => (j.id === jobId ? { ...j, lines: [...j.lines, { ...line, id: uid() }] } : j))),
          );
        },
        updateLine: (roId, jobId, lineId, patch) => {
          if (patch.qty !== undefined && patch.qty <= 0) fail("Quantity must be more than zero.");
          if (patch.unitPrice !== undefined && patch.unitPrice < 0) fail("Price can't be negative.");
          patchRo(roId, "repair_orders", (ro) =>
            editableJobs(ro, (jobs) =>
              jobs.map((j) => (j.id === jobId ? { ...j, lines: j.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : j)),
            ),
          );
        },
        removeLine: (roId, jobId, lineId) =>
          patchRo(roId, "repair_orders", (ro) =>
            editableJobs(ro, (jobs) => jobs.map((j) => (j.id === jobId ? { ...j, lines: j.lines.filter((l) => l.id !== lineId) } : j))),
          ),
        completeWork: (roId) => {
          const { s, user, ws } = ctx("repair_orders");
          const ro = findRo(s, roId, ws.id);
          if (ro.status !== "in_progress") fail("Only jobs in progress can be completed.");
          if (ro.jobs.some((j) => j.approval === "pending")) fail("Approve or decline every pending job first.");
          if (!approvedJobs(ro).some((j) => j.lines.length)) fail("There is no approved work to complete.");
          const usage = approvedPartUsage(ro);
          for (const [partId, qty] of usage) {
            const p = s.parts.find((x) => x.id === partId);
            if (!p) fail("A part on this job card no longer exists.");
            else if (p.qtyOnHand < qty) fail(`Not enough stock: ${p.name} needs ${qty}, only ${p.qtyOnHand} in stock. Receive stock first.`);
          }
          const at = nowIso();
          set({
            parts: s.parts.map((p) => (usage.has(p.id) ? { ...p, qtyOnHand: p.qtyOnHand - usage.get(p.id)! } : p)),
            movements: [
              ...s.movements,
              ...[...usage].map(([partId, qty]) => ({
                id: uid(), workshopId: ws.id, partId, qty: -qty, reason: "used_on_job" as const, roId, note: `Used on RO-${ro.number}`, userId: user.id, createdAt: at,
              })),
            ],
            ros: s.ros.map((r): RepairOrder => (r.id === roId ? { ...r, status: "completed", stockDeducted: true, completedAt: at, updatedAt: at, label: "ready", jobs: r.jobs.map((j) => (j.approval === "approved" ? { ...j, done: true } : j)) } : r)),
            audit: [...s.audit, log(user, "ro.completed", "repair_order", roId, `RO-${ro.number} work completed`)],
          });
        },
        reopenRo: (roId) => {
          const { s, user, ws } = ctx("repair_orders");
          const ro = findRo(s, roId, ws.id);
          if (ro.status !== "completed") fail("Only completed (not yet invoiced) job cards can be reopened.");
          const usage = ro.stockDeducted ? approvedPartUsage(ro) : new Map<string, number>();
          const at = nowIso();
          set({
            parts: s.parts.map((p) => (usage.has(p.id) ? { ...p, qtyOnHand: p.qtyOnHand + usage.get(p.id)! } : p)),
            movements: [
              ...s.movements,
              ...[...usage].map(([partId, qty]) => ({
                id: uid(), workshopId: ws.id, partId, qty, reason: "returned_from_job" as const, roId, note: `RO-${ro.number} reopened`, userId: user.id, createdAt: at,
              })),
            ],
            ros: s.ros.map((r): RepairOrder => (r.id === roId ? { ...r, status: "in_progress", stockDeducted: false, completedAt: null, updatedAt: at, label: "in_bay" } : r)),
            audit: [...s.audit, log(user, "ro.reopened", "repair_order", roId, `RO-${ro.number} reopened, parts returned to stock`)],
          });
        },
        cancelRo: (roId, reason) => {
          if (!reason.trim()) fail("Give a reason for cancelling.");
          patchRo(roId, "repair_orders", (ro) => {
            if (!EDITABLE.includes(ro.status)) fail("Only estimates and jobs in progress can be cancelled.");
            return { ...ro, status: "cancelled", notes: [ro.notes, `Cancelled: ${reason.trim()}`].filter(Boolean).join("\n") };
          }, ["ro.cancelled", reason.trim()]);
        },

        // ---- Invoices & payments ---------------------------------------------------
        createInvoice: (roId) => {
          const { s, user, ws } = ctx("invoices");
          const ro = findRo(s, roId, ws.id);
          if (ro.status !== "completed") fail("Complete the work before creating the invoice.");
          const jobs = approvedJobs(ro);
          const seq = ws.nextInvoiceSeq;
          const inv: Invoice = {
            id: uid(), workshopId: ws.id, seq, number: `${ws.invoicePrefix}-${String(seq).padStart(6, "0")}`,
            roId, customerId: ro.customerId, vehicleId: ro.vehicleId,
            lines: jobs.flatMap((j) => j.lines.map((l) => ({
              jobTitle: j.title, kind: l.kind, description: l.description, partId: l.partId, qty: l.qty, unitPrice: l.unitPrice, amount: lineAmount(l),
            }))),
            partsTaxRate: ws.partsTaxRate, laborTaxRate: ws.laborTaxRate, totals: computeTotals(jobs, ro.discount, ws),
            status: "unpaid", voidReason: "", createdBy: user.id, issuedAt: nowIso(),
          };
          set({
            invoices: [...s.invoices, inv],
            workshops: s.workshops.map((w) => (w.id === ws.id ? { ...w, nextInvoiceSeq: seq + 1 } : w)),
            ros: s.ros.map((r): RepairOrder => (r.id === roId ? { ...r, status: "invoiced", invoiceId: inv.id, updatedAt: nowIso() } : r)),
            audit: [...s.audit, log(user, "invoice.created", "invoice", inv.id, `${inv.number} for RO-${ro.number}`)],
          });
          return inv.id;
        },
        voidInvoice: (invoiceId, reason) => {
          const { s, user, ws } = ctx("void_invoice");
          const inv = s.invoices.find((i) => i.id === invoiceId && i.workshopId === ws.id) ?? fail("Invoice not found.");
          if (inv.status === "void") fail("This invoice is already void.");
          if (paidAmount(inv.id, s.payments) > 0) fail("This invoice has payments. Refunds and credit notes come in a later phase.");
          if (!reason.trim()) fail("Give a reason for voiding.");
          set({
            invoices: s.invoices.map((i): Invoice => (i.id === invoiceId ? { ...i, status: "void", voidReason: reason.trim() } : i)),
            ros: s.ros.map((r): RepairOrder => (r.id === inv.roId ? { ...r, status: "completed", invoiceId: null, updatedAt: nowIso() } : r)),
            audit: [...s.audit, log(user, "invoice.voided", "invoice", invoiceId, `${inv.number} voided: ${reason.trim()}`)],
          });
        },
        addPayment: (invoiceId, input) => {
          const { s, user, ws } = ctx("payments");
          const inv = s.invoices.find((i) => i.id === invoiceId && i.workshopId === ws.id) ?? fail("Invoice not found.");
          if (inv.status === "void") fail("Can't take payment on a void invoice.");
          const balance = invoiceBalance(inv, s.payments);
          if (!Number.isInteger(input.amount) || input.amount <= 0) fail("Enter an amount more than zero.");
          if (input.amount > balance) fail("Amount is more than the balance due.");
          const pay: Payment = {
            id: uid(), workshopId: ws.id, invoiceId, method: input.method, amount: input.amount, reference: input.reference.trim(), userId: user.id, receivedAt: nowIso(),
          };
          const fullyPaid = input.amount === balance;
          set({
            payments: [...s.payments, pay],
            invoices: s.invoices.map((i): Invoice => (i.id === invoiceId ? { ...i, status: fullyPaid ? "paid" : "partial" } : i)),
            ros: fullyPaid ? s.ros.map((r): RepairOrder => (r.id === inv.roId ? { ...r, status: "closed", updatedAt: nowIso() } : r)) : s.ros,
            audit: [...s.audit, log(user, "payment.received", "invoice", invoiceId, `${inv.number}: ${input.method} payment`)],
          });
        },
      };
    },
    {
      name: "workshop-pos-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the runtime-only flag
      partialize: ({ hydrated, ...rest }) => rest,
    },
  ),
);

// ---- Read hooks ------------------------------------------------------------------

type ScopedKey = "customers" | "vehicles" | "parts" | "movements" | "cannedJobs" | "ros" | "invoices" | "payments" | "audit" | "users";

/** Records of one type that belong to the signed-in workshop. */
export function useScoped<K extends ScopedKey>(key: K): State[K] {
  const list = useStore((s) => s[key]);
  const wsId = useStore((s) => s.session?.workshopId);
  return useMemo(() => (list as { workshopId: string }[]).filter((x) => x.workshopId === wsId) as State[K], [list, wsId]);
}

export function useSession() {
  const session = useStore((s) => s.session);
  const users = useStore((s) => s.users);
  const workshops = useStore((s) => s.workshops);
  return useMemo(() => {
    const user = users.find((u) => u.id === session?.userId) ?? null;
    const workshop = workshops.find((w) => w.id === session?.workshopId) ?? null;
    return { user, workshop };
  }, [session, users, workshops]);
}

/** Like useSession, for screens inside the app shell where a session is guaranteed. */
export function useAuthed() {
  const { user, workshop } = useSession();
  if (!user || !workshop) throw new Error("useAuthed used outside the signed-in app");
  return { user, workshop };
}
