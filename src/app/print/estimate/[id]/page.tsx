"use client";

import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { InvoiceDocument, type DocumentLine } from "@/components/invoice-document";
import { PrintFrame } from "@/components/print-frame";
import { lineAmount, roTotals } from "@/lib/calc";
import { roNumber } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useSession, useScoped } from "@/lib/store";
import type { PrinterSettings } from "@/lib/types";

export default function PrintEstimatePage() {
  return (
    <Suspense>
      <PrintEstimate />
    </Suspense>
  );
}

function PrintEstimate() {
  const { id } = useParams<{ id: string }>();
  const { workshop } = useSession();
  const ros = useScoped("ros");
  const look = useLookups();
  const [paper, setPaper] = useState<PrinterSettings["paper"]>("A4");

  const ro = ros.find((r) => r.id === id);
  if (!workshop) return null;
  if (!ro) return <p className="p-10 text-center text-slate-500">Job card not found.</p>;

  // Approved and pending work first, declined work listed after it for the record.
  const ordered = [...ro.jobs.filter((j) => j.approval !== "declined"), ...ro.jobs.filter((j) => j.approval === "declined")];
  const lines: DocumentLine[] = ordered.flatMap((j) =>
    j.lines.map((l) => ({
      jobTitle: j.approval === "pending" && ro.status !== "estimate" ? `${j.title} (awaiting approval)` : j.title,
      kind: l.kind, description: l.description, qty: l.qty, unitPrice: l.unitPrice, amount: lineAmount(l), declined: j.approval === "declined",
    })),
  );

  return (
    <PrintFrame paper={paper} onPaperChange={setPaper} autoPrint={false} allowThermal={false}>
      <InvoiceDocument
        kind={ro.status === "estimate" ? "estimate" : "jobcard"}
        number={roNumber(ro.number)} date={ro.createdAt} workshop={workshop}
        customer={look.customer(ro.customerId)} vehicle={look.vehicle(ro.vehicleId)} roNumberValue={ro.number}
        odometer={ro.odometerIn} concern={ro.concern} lines={lines} totals={roTotals(ro, workshop)}
        partsTaxRate={workshop.partsTaxRate} laborTaxRate={workshop.laborTaxRate}
      />
    </PrintFrame>
  );
}
