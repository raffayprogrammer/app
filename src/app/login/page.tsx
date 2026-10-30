"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { attemptResult } from "@/components/toast";
import { Badge, Button, Field, Input } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_WORKSHOP } from "@/lib/demo";
import { useSession, useStore } from "@/lib/store";

const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "true";

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

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back. Sign in to your workshop.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signIn(email, password);
        }}
        className="mt-6 space-y-4"
      >
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        New workshop?{" "}
        <Link href="/signup" className="font-medium text-orange-700 hover:underline">Create an account</Link>
      </p>

      {SHOW_DEMO && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">Try the demo</p>
          <p className="mb-3 text-xs text-slate-500">{DEMO_WORKSHOP} · password <code>{DEMO_PASSWORD}</code></p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((u) => (
              <button
                key={u.email}
                disabled={busy}
                onClick={() => void signIn(u.email, DEMO_PASSWORD)}
                className="flex flex-col items-start rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-slate-800">{u.name}</span>
                <Badge tone={u.role === "owner" ? "orange" : "slate"} className="mt-1">
                  {ROLE_LABELS[u.role]}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
