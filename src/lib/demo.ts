import type { Role } from "./types";

// Demo workshop shown on the login page (when NEXT_PUBLIC_SHOW_DEMO_LOGINS=true)
// and created in Supabase by scripts/seed-demo.ts.

export const DEMO_WORKSHOP = "Al-Noor Auto Workshop";
export const DEMO_PASSWORD = "demo123";

export const DEMO_ACCOUNTS: { name: string; email: string; role: Role }[] = [
  { name: "Usman Tariq", email: "owner@demo.pk", role: "owner" },
  { name: "Hamza Ali", email: "advisor@demo.pk", role: "advisor" },
  { name: "Imran Khan", email: "tech@demo.pk", role: "technician" },
  { name: "Bilal Ahmed", email: "tech2@demo.pk", role: "technician" },
  { name: "Ayesha Noor", email: "cashier@demo.pk", role: "cashier" },
];
