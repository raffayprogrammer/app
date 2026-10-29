import type { Role } from "./types";

export type Permission =
  | "dashboard"
  | "board"
  | "my_work"
  | "customers"
  | "vehicles"
  | "repair_orders"
  | "inventory"
  | "inventory_edit"
  | "invoices"
  | "payments"
  | "discount"
  | "void_invoice"
  | "reports"
  | "settings"
  | "settings_view"
  | "users"
  | "audit";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "dashboard", "board", "my_work", "customers", "vehicles", "repair_orders", "inventory", "inventory_edit",
    "invoices", "payments", "discount", "void_invoice", "reports", "settings", "settings_view", "users", "audit",
  ],
  advisor: ["dashboard", "board", "customers", "vehicles", "repair_orders", "inventory", "invoices", "payments", "discount", "settings_view"],
  cashier: ["dashboard", "customers", "vehicles", "inventory", "inventory_edit", "invoices", "payments", "reports", "settings_view"],
  technician: ["my_work"],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  advisor: "Service Advisor",
  cashier: "Cashier / Storekeeper",
  technician: "Technician",
};

export function can(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}

export function homeFor(role: Role): string {
  return role === "technician" ? "/my-work" : "/dashboard";
}
