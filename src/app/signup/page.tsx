"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { attemptResult, toast } from "@/components/toast";
import { Button, Field, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function SignupPage() {
  const router = useRouter();
  const signup = useStore((s) => s.signup);
  const [form, setForm] = useState({ workshopName: "", city: "", phone: "", ownerName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await attemptResult(() => signup(form));
    setBusy(false);
    if (result === "ready") {
      toast("Workshop created. Welcome!");
      router.replace("/settings");
    } else if (result === "confirm_email") {
      setSentTo(form.email.trim());
    }
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <MailCheck className="h-10 w-10 text-orange-600" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          We sent a confirmation link to <b>{sentTo}</b>. Click it, then sign in — your workshop is set up on your first sign-in.
        </p>
        <Link href="/login"><Button className="mt-6 w-full">Go to sign in</Button></Link>
      </AuthLayout>
    );
  }

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
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create workshop"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-orange-700 hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
