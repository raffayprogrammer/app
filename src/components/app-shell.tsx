"use client";

import {
  BarChart3, Car, ClipboardList, FileText, HardHat, LayoutDashboard, LogOut, Menu, Package, Plus, Settings, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { useSession, useStore } from "@/lib/store";
import { Logo } from "./brand";
import { GlobalSearch } from "./global-search";
import { Button, EmptyState } from "./ui";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; perm: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
  { href: "/board", label: "Job Board", icon: ClipboardList, perm: "board" },
  { href: "/my-work", label: "My Work", icon: HardHat, perm: "my_work" },
  { href: "/customers", label: "Customers", icon: Users, perm: "customers" },
  { href: "/vehicles", label: "Vehicles", icon: Car, perm: "vehicles" },
  { href: "/inventory", label: "Inventory", icon: Package, perm: "inventory" },
  { href: "/invoices", label: "Invoices", icon: FileText, perm: "invoices" },
  { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings_view" },
];

const ROUTE_PERMS: [string, Permission][] = [
  ["/repair-orders", "repair_orders"],
  ...NAV.map((n): [string, Permission] => [n.href, n.perm]),
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, workshop } = useSession();
  const logout = useStore((s) => s.logout);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const setMenuOpen = (open: boolean) => setMenuPath(open ? pathname : null);

  useEffect(() => {
    if (!user || !user.active) router.replace("/login");
  }, [router, user]);

  if (!user || !workshop) return null;

  const required = ROUTE_PERMS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"))?.[1];
  const allowed = !required || can(user.role, required);
  const nav = NAV.filter((n) => can(user.role, n.perm));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo light />
      </div>
      <p className="truncate px-5 pb-3 text-xs text-slate-400" title={workshop.name}>{workshop.name}</p>
      <ul className="flex-1 space-y-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/") || (href === "/board" && pathname.startsWith("/repair-orders"));
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-3">
        <div className="px-2 pb-2">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-slate-900 lg:block print:hidden">{sidebar}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-64 bg-slate-900">
            <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-4 text-slate-400" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6 print:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          {can(user.role, "customers") ? <GlobalSearch /> : <div className="flex-1" />}
          <div className="ml-auto flex items-center gap-2">
            {can(user.role, "repair_orders") && (
              <Link href="/repair-orders/new">
                <Button size="md">
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New job card</span>
                </Button>
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          {allowed ? (
            children
          ) : (
            <EmptyState title="You don't have access to this page" text="Ask the workshop owner if you need it." />
          )}
        </main>
      </div>
    </div>
  );
}
