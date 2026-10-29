"use server";

// Creating a staff login needs Supabase's admin API (secret key), so it runs on
// the server only. The caller must be an active owner; the new account is
// always added to the caller's own workshop.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["owner", "advisor", "technician", "cashier"];

export async function createStaffAccount(input: { name: string; email: string; password: string; role: Role }): Promise<{ error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) return { error: "The server is missing its Supabase settings." };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { error: "Name is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (input.password.length < 6) return { error: "Password must be at least 6 characters." };
  if (!ROLES.includes(input.role)) return { error: "Choose a role." };

  // Who is asking? Read their session from the request cookies.
  const cookieStore = await cookies();
  const asUser = createServerClient(url, publishable, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return { error: "You are signed out. Please sign in again." };
  const { data: me } = await asUser.from("profiles").select("workshop_id, role, active").eq("id", auth.user.id).maybeSingle();
  if (!me || !me.active || me.role !== "owner") return { error: "Only the workshop owner can add staff." };

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !created.user) {
    return { error: /already|registered|exists/i.test(error?.message ?? "") ? "An account with this email already exists." : error?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, workshop_id: me.workshop_id, name, email, role: input.role });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Could not save the staff profile. Please try again." };
  }
  await admin.from("audit_log").insert({
    workshop_id: me.workshop_id, user_id: auth.user.id, action: "user.created", entity: "user", entity_id: created.user.id,
    summary: `Added ${name} (${input.role})`,
  });
  return {};
}
