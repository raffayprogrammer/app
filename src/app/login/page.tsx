"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { attempt } from "@/components/toast";
import { Badge, Button, Field, Input } from "@/components/ui";
import { homeFor, ROLE_LABELS } from "@/lib/permissions";
import { DEMO_PASSWORD } from "@/lib/seed";
import { useSession, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useSession();
  const login = useStore((s) => s.login);
  const loginAs = useStore((s) => s.loginAs);
  const users = useStore((s) => s.users);
  const workshops = useStore((s) => s.workshops);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) router.replace(homeFor(user.role));
  }, [router, user]);

  // One-click demo accounts from the seeded workshop.
  const demoUsers = useMemo(() => users.filter((u) => u.password === DEMO_PASSWORD && u.email.endsWith("@demo.pk")), [users]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    attempt(() => login(email, password));
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Welcome back. Sign in to your workshop.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        New workshop?{" "}
        <Link href="/signup" className="font-medium text-orange-700 hover:underline">Create an account</Link>
      </p>

      {demoUsers.length > 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">Try the demo</p>
          <p className="mb-3 text-xs text-slate-500">
            {workshops.find((w) => w.id === demoUsers[0].workshopId)?.name} · password <code>{DEMO_PASSWORD}</code>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {demoUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => attempt(() => loginAs(u.id))}
                className="flex flex-col items-start rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-orange-400 hover:bg-orange-50"
              >
                <span className="text-sm font-medium text-slate-800">{u.name}</span>
                <Badge tone={u.role === "owner" ? "orange" : u.role === "technician" ? "blue" : "slate"} className="mt-1">
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
