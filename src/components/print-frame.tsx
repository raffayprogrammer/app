"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/store";
import type { PrinterSettings } from "@/lib/types";
import { Button, Select } from "./ui";

/** Page wrapper for printable documents: sets the paper size and optionally prints on open. */
export function PrintFrame({ paper, onPaperChange, autoPrint, allowThermal = true, children }: {
  paper: PrinterSettings["paper"]; onPaperChange: (p: PrinterSettings["paper"]) => void; autoPrint: boolean; allowThermal?: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [router, user]);

  useEffect(() => {
    if (!autoPrint || !user) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint, user]);

  if (!user) return null;
  const thermal = paper !== "A4";
  const pageCss = thermal ? `@page { size: ${paper} auto; margin: 0; }` : "@page { size: A4; margin: 12mm; }";

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <style>{pageCss}</style>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-300 bg-white px-4 py-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => (window.history.length > 1 ? router.back() : window.close())}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="ml-auto" />
        {allowThermal && (
          <Select value={paper} onChange={(e) => onPaperChange(e.target.value as PrinterSettings["paper"])} className="h-8 w-auto text-xs">
            <option value="A4">A4 paper</option>
            <option value="80mm">Receipt 80mm</option>
            <option value="58mm">Receipt 58mm</option>
          </Select>
        )}
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
      </div>
      <div className="flex justify-center p-6 print:block print:p-0">
        <div
          className={thermal ? "bg-white p-3 shadow print:p-1 print:shadow-none" : "w-[210mm] bg-white p-[12mm] shadow print:w-auto print:p-0 print:shadow-none"}
          style={thermal ? { width: paper } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
