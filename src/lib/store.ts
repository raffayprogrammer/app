"use client";

// Data layer backed by Supabase. Screens read from this store synchronously;
// every action writes to the database and then reloads the workshop's data.
// Quick checks here give friendly messages; the database enforces every rule
// again (row-level security, guards and workflow functions in supabase/migrations).

import type { PostgrestError } from "@supabase/supabase-js";
import { useMemo } from "react";
import { create } from "zustand";
import { normalizePlate, plateKey } from "./format";
import { can, type Permission } from "./permissions";
import { supabase } from "./supabase/client";
import { EMPTY_DATA, loadWorkshopData } from "./supabase/data";
import type {
  Approval, CannedJob, Customer, Data, Job, Line, Part, PaymentMethod, RepairOrder, Session, User, Vehicle, Workshop,
} from "./types";

export class ActionError extends Error {}
const fail = (msg: string): never => {
  throw new ActionError(msg);
};

/** Turn a database error into a message a workshop user understands. */
function friendly(e: Pick<PostgrestError, "message" | "code">): string {
  const m = e.message ?? "";
  if (e.code === "23505") {
    if (m.includes("plate_key")) return "That number plate is already registered.";
    if (m.includes("parts_number_unique")) return "That part number already exists.";
    if (m.includes("one_open_ro_per_vehicle")) return "This vehicle already has an open job card.";
    return "That record already exists.";
  }
  if (e.code === "42501" || /row-level security/i.test(m)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return "Can't reach the server. Check your internet connection.";
  return m || "Something went wrong. Please try again.";
}

/** Run a Supabase call and throw a friendly ActionError if it failed. */
async function db<T>(call: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await call;
  if (error) fail(friendly(error));
  return data;
}

type CustomerInput = Omit<Customer, "id" | "workshopId" | "createdAt">;
type VehicleInput = Omit<Vehicle, "id" | "workshopId" | "createdAt">;
type PartInput = Omit<Part, "id" | "workshopId" | "createdAt" | "qtyOnHand">;
type SignupInput = { workshopName: string; city: string; phone: string; ownerName: string; email: string; password: string };

interface Actions {
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** "ready" when signed in, "confirm_email" when Supabase sent a confirmation link first. */
  signup: (input: SignupInput) => Promise<"ready" | "confirm_email">;

  updateWorkshop: (patch: Partial<Omit<Workshop, "id" | "nextInvoiceSeq" | "nextRoSeq" | "createdAt">>) => Promise<void>;
  updateUser: (id: string, patch: Partial<Pick<User, "name" | "role" | "active">>) => Promise<void>;

  saveCustomer: (input: CustomerInput, id?: string) => Promise<string>;
  saveVehicle: (input: VehicleInput, id?: string) => Promise<string>;

  savePart: (input: PartInput & { openingQty?: number }, id?: string) => Promise<string>;
  adjustStock: (partId: string, qty: number, note: string) => Promise<void>;

  saveCannedJob: (input: Omit<CannedJob, "id" | "workshopId">, id?: string) => Promise<void>;
  deleteCannedJob: (id: string) => Promise<void>;

  createRo: (input: { customerId: string; vehicleId: string; concern: string; odometerIn: number | null; promisedAt: string | null; technicianId: string | null }) => Promise<string>;
  updateRo: (id: string, patch: Partial<Pick<RepairOrder, "concern" | "notes" | "odometerIn" | "promisedAt" | "technicianId" | "label" | "discount">>) => Promise<void>;
  addJob: (roId: string, title: string) => Promise<void>;
  addCannedJobToRo: (roId: string, cannedId: string) => Promise<void>;
  updateJob: (roId: string, jobId: string, patch: Partial<Pick<Job, "title" | "done">>) => Promise<void>;
  removeJob: (roId: string, jobId: string) => Promise<void>;
  setJobApproval: (roId: string, jobId: string, approval: Approval) => Promise<void>;
  addLine: (roId: string, jobId: string, line: Omit<Line, "id">) => Promise<void>;
  updateLine: (roId: string, jobId: string, lineId: string, patch: Partial<Omit<Line, "id" | "kind" | "partId">>) => Promise<void>;
  removeLine: (roId: string, jobId: string, lineId: string) => Promise<void>;
  completeWork: (roId: string) => Promise<void>;
  reopenRo: (roId: string) => Promise<void>;
  cancelRo: (roId: string, reason: string) => Promise<void>;

  createInvoice: (roId: string) => Promise<string>;
  voidInvoice: (invoiceId: string, reason: string) => Promise<void>;
  addPayment: (invoiceId: string, input: { method: PaymentMethod; amount: number; reference: string }) => Promise<void>;
}

export type State = Data & { session: Session | null; hydrated: boolean } & Actions;

const EDITABLE: RepairOrder["status"][] = ["estimate", "in_progress"];

export const useStore = create<State>()((set, get) => {
  const sb = supabase;

  /** Current user + workshop, after checking an optional permission. */
  const ctx = (perm?: Permission) => {
    const s = get();
    const user = s.users.find((u) => u.id === s.session?.userId);
    const ws = s.workshops.find((w) => w.id === s.session?.workshopId);
    if (!user || !ws) return fail("You are signed out. Please sign in again.");
    if (perm && !can(user.role, perm)) fail("You don't have permission to do that.");
    return { s, user, ws };
  };

  const findRo = (roId: string) => get().ros.find((r) => r.id === roId) ?? fail("Job card not found.");
  const editableRo = (roId: string) => {
    const ro = findRo(roId);
    if (!EDITABLE.includes(ro.status)) fail("This job card is closed for editing. Reopen it first.");
    return ro;
  };

  /** Load the signed-in user's workshop. Creates the workshop on first sign-in after email confirmation. */
  const loadFor = async (userId: string, meta: Record<string, unknown> | undefined) => {
    const client = sb();
    let { data: me } = await client.from("profiles").select("id, workshop_id, active").eq("id", userId).maybeSingle();
    if (!me && typeof meta?.workshop_name === "string") {
      await db(client.rpc("create_workshop", {
        p_name: meta.workshop_name, p_owner_name: String(meta.owner_name ?? ""), p_city: String(meta.city ?? ""), p_phone: String(meta.phone ?? ""),
      }));
      ({ data: me } = await client.from("profiles").select("id, workshop_id, active").eq("id", userId).maybeSingle());
    }
    if (!me) {
      await client.auth.signOut();
      return fail("This account isn't linked to an active workshop. Ask the workshop owner.");
    }
    const data = await loadWorkshopData(client);
    set({ ...data, session: { userId, workshopId: me.workshop_id } });
  };

  /** Write, then reload so every screen shows what the database now holds. */
  const mutate = async <T>(work: () => Promise<T>): Promise<T> => {
    const result = await work();
    await get().refresh();
    return result;
  };

  return {
    ...EMPTY_DATA,
    session: null,
    hydrated: false,

    init: async () => {
      try {
        const { data } = await sb().auth.getSession();
        const user = data.session?.user;
        if (user) await loadFor(user.id, user.user_metadata);
      } catch {
        set({ ...EMPTY_DATA, session: null });
      } finally {
        set({ hydrated: true });
      }
    },
    refresh: async () => {
      if (!get().session) return;
      try {
        set(await loadWorkshopData(sb()));
      } catch (e) {
        fail(friendly(e as PostgrestError));
      }
    },

    // ---- Auth ----------------------------------------------------------------
    login: async (email, password) => {
      const { data, error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        fail(/invalid login/i.test(error.message) ? "Wrong email or password."
          : /not confirmed/i.test(error.message) ? "Confirm your email first — check your inbox for the link."
          : error.message);
      }
      await loadFor(data.user!.id, data.user!.user_metadata);
      return ctx().user;
    },
    logout: async () => {
      await sb().auth.signOut();
      set({ ...EMPTY_DATA, session: null });
    },
    signup: async (input) => {
      if (!input.workshopName.trim() || !input.ownerName.trim()) fail("Workshop name and your name are required.");
      if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) fail("Enter a valid email address.");
      if (input.password.length < 6) fail("Password must be at least 6 characters.");
      const { data, error } = await sb().auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          // Kept on the account so the workshop can be created on first sign-in if email confirmation is on.
          data: { workshop_name: input.workshopName.trim(), owner_name: input.ownerName.trim(), city: input.city.trim(), phone: input.phone.trim() },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
        },
      });
      if (error) fail(/already registered|already exists/i.test(error.message) ? "An account with this email already exists." : error.message);
      // Supabase returns a user with no identities when the email is already taken (and hides that for privacy).
      if (data.user && data.user.identities?.length === 0) fail("An account with this email already exists.");
      if (!data.session) return "confirm_email";
      await loadFor(data.user!.id, data.user!.user_metadata);
      return "ready";
    },

    // ---- Settings ------------------------------------------------------------
    updateWorkshop: (patch) => mutate(async () => {
      const { ws } = ctx("settings");
      for (const r of [patch.partsTaxRate, patch.laborTaxRate]) if (r !== undefined && (r < 0 || r > 100)) fail("Tax rate must be 0–100%.");
      const map: Record<string, string> = {
        name: "name", phone: "phone", email: "email", address: "address", city: "city", ntn: "ntn", laborRate: "labor_rate",
        partsTaxRate: "parts_tax_rate", laborTaxRate: "labor_tax_rate", invoicePrefix: "invoice_prefix", printer: "printer",
      };
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (map[k]) row[map[k]] = v;
      await db(sb().from("workshops").update(row).eq("id", ws.id));
    }),
    updateUser: (id, patch) => mutate(async () => {
      const { s } = ctx("users");
      const target = s.users.find((u) => u.id === id) ?? fail("User not found.");
      const owners = s.users.filter((u) => u.role === "owner" && u.active);
      if (target.role === "owner" && ((patch.role && patch.role !== "owner") || patch.active === false) && owners.length <= 1) {
        fail("A workshop must keep at least one active owner.");
      }
      await db(sb().from("profiles").update(patch).eq("id", id));
    }),

    // ---- Customers & vehicles --------------------------------------------------
    saveCustomer: (input, id) => mutate(async () => {
      const { ws } = ctx("customers");
      if (!input.name.trim()) fail("Customer name is required.");
      if (!input.phone.trim()) fail("Phone number is required.");
      const row = {
        kind: input.kind, name: input.name.trim(), phone: input.phone.trim(), email: input.email.trim(), address: input.address.trim(),
        ntn: input.ntn.trim(), notes: input.notes,
      };
      if (id) {
        await db(sb().from("customers").update(row).eq("id", id));
        return id;
      }
      const created = await db(sb().from("customers").insert({ ...row, workshop_id: ws.id }).select("id").single());
      return (created as { id: string }).id;
    }),
    saveVehicle: (input, id) => mutate(async () => {
      const { s, ws } = ctx("vehicles");
      const plate = normalizePlate(input.plate);
      if (!plate) fail("Number plate is required.");
      if (!input.make.trim() || !input.model.trim()) fail("Make and model are required.");
      if (s.vehicles.some((v) => plateKey(v.plate) === plateKey(plate) && v.id !== id)) fail(`Plate ${plate} is already registered to another vehicle.`);
      const row = {
        customer_id: input.customerId, plate, make: input.make.trim(), model: input.model.trim(), year: input.year.trim(),
        vin: input.vin.trim().toUpperCase(), color: input.color.trim(), odometer: input.odometer,
      };
      if (id) {
        await db(sb().from("vehicles").update(row).eq("id", id));
        return id;
      }
      const created = await db(sb().from("vehicles").insert({ ...row, workshop_id: ws.id }).select("id").single());
      return (created as { id: string }).id;
    }),

    // ---- Inventory ---------------------------------------------------------------
    savePart: ({ openingQty, ...input }, id) => mutate(async () => {
      const { ws } = ctx("inventory_edit");
      if (!input.name.trim()) fail("Part name is required.");
      if (input.price < 0 || input.cost < 0) fail("Prices can't be negative.");
      const row = {
        part_number: input.partNumber.trim(), name: input.name.trim(), brand: input.brand.trim(), category: input.category.trim(),
        location: input.location.trim(), cost: input.cost, price: input.price, min_qty: input.minQty, active: input.active,
      };
      if (id) {
        await db(sb().from("parts").update(row).eq("id", id));
        return id;
      }
      const created = (await db(sb().from("parts").insert({ ...row, workshop_id: ws.id }).select("id").single())) as { id: string };
      const qty = Math.max(0, Math.floor(openingQty ?? 0));
      if (qty > 0) {
        await db(sb().rpc("adjust_stock", { p_part: created.id, p_qty: qty, p_note: "Opening stock", p_reason: "opening" }));
      }
      return created.id;
    }),
    adjustStock: (partId, qty, note) => mutate(async () => {
      ctx("inventory_edit");
      if (!Number.isInteger(qty) || qty === 0) fail("Enter a whole number other than zero.");
      if (!note.trim()) fail("Add a reason for the stock change.");
      await db(sb().rpc("adjust_stock", { p_part: partId, p_qty: qty, p_note: note.trim() }));
    }),

    saveCannedJob: (input, id) => mutate(async () => {
      const { ws } = ctx("settings");
      if (!input.title.trim()) fail("Give the canned job a name.");
      if (!input.lines.length) fail("Add at least one line.");
      const row = { title: input.title.trim(), lines: input.lines };
      if (id) await db(sb().from("canned_jobs").update(row).eq("id", id));
      else await db(sb().from("canned_jobs").insert({ ...row, workshop_id: ws.id }));
    }),
    deleteCannedJob: (id) => mutate(async () => {
      ctx("settings");
      await db(sb().from("canned_jobs").delete().eq("id", id));
    }),

    // ---- Repair orders -----------------------------------------------------------
    createRo: (input) => mutate(async () => {
      const { s } = ctx("repair_orders");
      const vehicle = s.vehicles.find((v) => v.id === input.vehicleId) ?? fail("Choose a vehicle.");
      const open = s.ros.find((r) => r.vehicleId === vehicle.id && ["estimate", "in_progress", "completed"].includes(r.status));
      if (open) fail(`This vehicle already has an open job card (RO-${open.number}).`);
      const id = await db(sb().rpc("open_repair_order", {
        p_customer: input.customerId, p_vehicle: input.vehicleId, p_concern: input.concern, p_odometer: input.odometerIn,
        p_promised_at: input.promisedAt, p_technician: input.technicianId,
      }));
      return id as string;
    }),
    updateRo: (id, patch) => mutate(async () => {
      const { user } = ctx();
      const { label, ...rest } = patch;
      if (label !== undefined) {
        if (!can(user.role, "my_work") && !can(user.role, "repair_orders")) fail("You don't have permission to do that.");
        await db(sb().rpc("set_ro_label", { p_ro: id, p_label: label }));
      }
      if (Object.keys(rest).length === 0) return;
      ctx("repair_orders");
      if (rest.discount !== undefined) {
        if (!can(user.role, "discount")) fail("You don't have permission to give discounts.");
        if (rest.discount < 0) fail("Discount can't be negative.");
        editableRo(id);
      }
      const map: Record<string, string> = {
        concern: "concern", notes: "notes", odometerIn: "odometer_in", promisedAt: "promised_at", technicianId: "technician_id", discount: "discount",
      };
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(rest)) row[map[k]] = v;
      await db(sb().from("repair_orders").update(row).eq("id", id));
    }),
    addJob: (roId, title) => mutate(async () => {
      const { ws } = ctx("repair_orders");
      if (!title.trim()) fail("Give the job a name.");
      const ro = editableRo(roId);
      await db(sb().from("jobs").insert({ workshop_id: ws.id, repair_order_id: roId, title: title.trim(), sort_order: ro.jobs.length }));
    }),
    addCannedJobToRo: (roId, cannedId) => mutate(async () => {
      const { s, ws } = ctx("repair_orders");
      const ro = editableRo(roId);
      const cj = s.cannedJobs.find((c) => c.id === cannedId) ?? fail("Canned job not found.");
      const job = (await db(sb().from("jobs").insert({ workshop_id: ws.id, repair_order_id: roId, title: cj.title, sort_order: ro.jobs.length }).select("id").single())) as { id: string };
      // Re-price parts from today's price list rather than the price saved in the template.
      const lines = cj.lines.map((l, i) => {
        const p = l.partId ? s.parts.find((x) => x.id === l.partId) : undefined;
        return {
          workshop_id: ws.id, job_id: job.id, kind: l.kind, description: p ? p.name : l.description, part_id: l.partId ?? null,
          qty: l.qty, unit_price: p ? p.price : l.unitPrice, sort_order: i,
        };
      });
      if (lines.length) await db(sb().from("job_lines").insert(lines));
    }),
    updateJob: (roId, jobId, patch) => mutate(async () => {
      ctx();
      if (patch.done !== undefined) await db(sb().rpc("set_job_done", { p_job: jobId, p_done: patch.done }));
      if (patch.title !== undefined) {
        ctx("repair_orders");
        if (!patch.title.trim()) fail("Job name can't be empty.");
        editableRo(roId);
        await db(sb().from("jobs").update({ title: patch.title.trim() }).eq("id", jobId));
      }
    }),
    removeJob: (roId, jobId) => mutate(async () => {
      ctx("repair_orders");
      editableRo(roId);
      await db(sb().from("jobs").delete().eq("id", jobId));
    }),
    setJobApproval: (roId, jobId, approval) => mutate(async () => {
      ctx("repair_orders");
      editableRo(roId);
      await db(sb().rpc("set_job_approval", { p_job: jobId, p_approval: approval }));
    }),
    addLine: (roId, jobId, line) => mutate(async () => {
      const { ws } = ctx("repair_orders");
      if (line.qty <= 0) fail("Quantity must be more than zero.");
      if (line.unitPrice < 0) fail("Price can't be negative.");
      const ro = editableRo(roId);
      const job = ro.jobs.find((j) => j.id === jobId) ?? fail("Job not found.");
      await db(sb().from("job_lines").insert({
        workshop_id: ws.id, job_id: jobId, kind: line.kind, description: line.description, part_id: line.partId ?? null,
        qty: line.qty, unit_price: line.unitPrice, sort_order: job.lines.length,
      }));
    }),
    updateLine: (roId, _jobId, lineId, patch) => mutate(async () => {
      ctx("repair_orders");
      if (patch.qty !== undefined && patch.qty <= 0) fail("Quantity must be more than zero.");
      if (patch.unitPrice !== undefined && patch.unitPrice < 0) fail("Price can't be negative.");
      editableRo(roId);
      const row: Record<string, unknown> = {};
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.qty !== undefined) row.qty = patch.qty;
      if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice;
      await db(sb().from("job_lines").update(row).eq("id", lineId));
    }),
    removeLine: (roId, _jobId, lineId) => mutate(async () => {
      ctx("repair_orders");
      editableRo(roId);
      await db(sb().from("job_lines").delete().eq("id", lineId));
    }),
    completeWork: (roId) => mutate(async () => {
      ctx("repair_orders");
      await db(sb().rpc("complete_repair_order", { p_ro: roId }));
    }),
    reopenRo: (roId) => mutate(async () => {
      ctx("repair_orders");
      await db(sb().rpc("reopen_repair_order", { p_ro: roId }));
    }),
    cancelRo: (roId, reason) => mutate(async () => {
      ctx("repair_orders");
      if (!reason.trim()) fail("Give a reason for cancelling.");
      await db(sb().rpc("cancel_repair_order", { p_ro: roId, p_reason: reason.trim() }));
    }),

    // ---- Invoices & payments -----------------------------------------------------
    createInvoice: (roId) => mutate(async () => {
      ctx("invoices");
      const id = await db(sb().rpc("issue_invoice", { p_ro: roId }));
      return id as string;
    }),
    voidInvoice: (invoiceId, reason) => mutate(async () => {
      ctx("void_invoice");
      if (!reason.trim()) fail("Give a reason for voiding.");
      await db(sb().rpc("void_invoice", { p_invoice: invoiceId, p_reason: reason.trim() }));
    }),
    addPayment: (invoiceId, input) => mutate(async () => {
      ctx("payments");
      if (!Number.isInteger(input.amount) || input.amount <= 0) fail("Enter an amount more than zero.");
      await db(sb().rpc("record_payment", { p_invoice: invoiceId, p_method: input.method, p_amount: input.amount, p_reference: input.reference.trim() }));
    }),
  };
});

// ---- Read hooks ------------------------------------------------------------------

type ScopedKey = "customers" | "vehicles" | "parts" | "movements" | "cannedJobs" | "ros" | "invoices" | "payments" | "audit" | "users" | "invoiceEmails";

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
