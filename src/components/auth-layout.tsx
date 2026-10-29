import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./brand";

const POINTS = [
  "Job cards from estimate to invoice — nothing typed twice",
  "Live Job Board for every car in the workshop",
  "Parts stock that updates itself as jobs are completed",
  "Invoices, split payments and thermal receipt printing",
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-slate-900 p-10 text-slate-300 lg:flex">
        <Logo light />
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-white">
            Run your whole workshop
            <br />
            from one screen.
          </h2>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} WorkshopPOS</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
