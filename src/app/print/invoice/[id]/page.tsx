"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintFrame } from "@/components/print-frame";
import { ThermalReceipt } from "@/components/thermal-receipt";
import { useLookups } from "@/lib/hooks";
import { useSession, useScoped } from "@/lib/store";
import type { PrinterSettings } from "@/lib/types";

export default function PrintInvoicePage() {
  return (
    <Suspense>
      <PrintInvoice />
    </Suspense>
  );
}

function PrintInvoice() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { workshop } = useSession();
  const invoices = useScoped("invoices");
  const payments = useScoped("payments");
  const ros = useScoped("ros");
  const look = useLookups();
  const [paper, setPaper] = useState<PrinterSettings["paper"]>(workshop?.printer.paper ?? "A4");

  const inv = invoices.find((i) => i.id === id);
  if (!workshop) return null;
  if (!inv) return <p className="p-10 text-center text-slate-500">Invoice not found.</p>;

  const pays = payments.filter((p) => p.invoiceId === inv.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const ro = ros.find((r) => r.id === inv.roId);
  const ws = { ...workshop, printer: { ...workshop.printer, paper } };

  return (
    <PrintFrame paper={paper} onPaperChange={setPaper} autoPrint={params.get("auto") === "1"}>
      {paper === "A4" ? (
        <InvoiceDocument
          kind="invoice" number={inv.number} date={inv.issuedAt} workshop={ws} customer={look.customer(inv.customerId)} vehicle={look.vehicle(inv.vehicleId)}
          roNumberValue={ro?.number ?? 0} odometer={ro?.odometerIn} lines={inv.lines} totals={inv.totals}
          partsTaxRate={inv.partsTaxRate} laborTaxRate={inv.laborTaxRate} payments={pays} status={inv.status} voidReason={inv.voidReason}
        />
      ) : (
        <ThermalReceipt workshop={ws} invoice={inv} roNumberValue={ro?.number ?? 0} customer={look.customer(inv.customerId)} vehicle={look.vehicle(inv.vehicleId)} payments={pays} />
      )}
    </PrintFrame>
  );
}
