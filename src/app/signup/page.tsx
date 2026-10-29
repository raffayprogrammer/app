"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { attemptResult } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const signup = useStore((s) => s.signup);
  const [form, setForm] = useState({ workshopName: "", city: "", phone: "", ownerName: "", email: "", password: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const owner = attemptResult(() => signup(form), "Workshop created. Welcome!");
    if (owner) router.replace("/settings");
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-slate-900">Create your workshop</h1>
      <p className="mt-1 text-sm text-slate-500">Set up your workshop account. You can add your team after.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Workshop name">
          <Input value={form.workshopName} onChange={set("workshopName")} placeholder="e.g. Khan Autos" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <Input value={form.city} onChange={set("city")} placeholder="Lahore" />
          </Field>
          <Field label="Workshop phone">
            <Input value={form.phone} onChange={set("phone")} placeholder="0300-1234567" />
          </Field>
        </div>
        <Field label="Your name">
          <Input value={form.ownerName} onChange={set("ownerName")} required />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <Input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required />
        </Field>
        <Button type="submit" className="w-full">Create workshop</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-orange-700 hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
