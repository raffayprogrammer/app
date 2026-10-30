"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { attemptResult } from "@/components/toast";
import { Badge, Button, Field, Input } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_WORKSHOP } from "@/lib/demo";
import { useSession, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "true";

const ROLE_HINTS: Record<Role, string> = {
  owner: "Sees everything: money, reports, team and settings",
  advisor: "Opens job cards, builds estimates, gets approvals",
  cashier: "Takes payments, prints receipts, manages stock",
};

export default function LoginPage() {
  const router = useRouter();
  const { user } = useSession();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [router, user]);

  const signIn = async (e: string, p: string) => {
    setBusy(true);
    await attemptResult(() => login(e, p));
    setBusy(false);
  };

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void signIn(email, password);
      }}
      className="space-y-4"
    >
      <Field label="Email">
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" variant={SHOW_DEMO ? "secondary" : undefined} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        New workshop?{" "}
        <Link href="/signup" className="font-medium text-orange-700 hover:underline">Create an account</Link>
      </p>
    </form>
  );

  if (!SHOW_DEMO) {
    return (
      <AuthLayout>
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Welcome back. Sign in to your workshop.</p>
        {form}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900">Try the demo</h1>
      <p className="mt-1 text-sm text-slate-500">{DEMO_WORKSHOP}. Pick a role to see the app from their side.</p>

      <div className="mt-6 space-y-2">
        {DEMO_ACCOUNTS.map((u) => (
          <button
            key={u.email}
            disabled={busy}
            onClick={() => void signIn(u.email, DEMO_PASSWORD)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
          >
            <span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{ROLE_LABELS[u.role]}</span>
                <Badge tone={u.role === "owner" ? "orange" : "slate"}>{u.name}</Badge>
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">{ROLE_HINTS[u.role]}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
      </div>

      <div className="my-8 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        Already have a workshop account?
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {form}
    </AuthLayout>
  );
}
