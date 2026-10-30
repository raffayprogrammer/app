// Server-only Supabase helpers (route handlers and server actions).

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Role } from "../types";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** Supabase as the signed-in user (their session cookie), so row-level security applies. */
export async function userClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        // Server actions and route handlers may refresh the session cookie; pages can't, which is fine.
        try {
          for (const c of list) cookieStore.set(c.name, c.value, c.options);
        } catch {}
      },
    },
  });
}

/** Supabase with the secret key: bypasses row-level security. Only for trusted server code. */
export function adminClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Member {
  userId: string;
  workshopId: string;
  role: Role;
  name: string;
  client: SupabaseClient;
}

/** The signed-in staff member, or null if signed out, inactive, or not in one of the allowed roles. */
export async function currentMember(roles?: Role[]): Promise<Member | null> {
  const client = await userClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  const { data: me } = await client.from("profiles").select("workshop_id, role, active, name").eq("id", auth.user.id).maybeSingle();
  if (!me || !me.active) return null;
  if (roles && !roles.includes(me.role)) return null;
  return { userId: auth.user.id, workshopId: me.workshop_id, role: me.role, name: me.name, client };
}
