// Builds the invoice email (HTML + plain text). Inline styles and tables only,
// because email clients ignore stylesheets.

import { roNumber } from "./format";
import { LINE_KIND, PAYMENT_METHOD } from "./meta";
import { formatMoney } from "./money";
import type { Customer, Invoice, Payment, Vehicle, Workshop } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Emails are built on the server (UTC), so show the workshop's local time explicitly.
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });

export function invoiceEmail(args: {
  workshop: Workshop;
  invoice: Invoice;
  roNumberValue: number;
  customer?: Customer;
  vehicle?: Vehicle;
  payments: Payment[];
  message: string;
}): { subject: string; html: string; text: string } {
  const { workshop: ws, invoice: inv, customer, vehicle, payments } = args;
  const t = inv.totals;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = inv.status === "void" ? 0 : t.total - paid;
  const subject = `Invoice ${inv.number} from ${ws.name}${vehicle ? ` · ${vehicle.plate}` : ""}`;

  const rows: string[] = [];
  inv.lines.forEach((l, i) => {
    if (i === 0 || inv.lines[i - 1].jobTitle !== l.jobTitle) {
      rows.push(`<tr><td colspan="4" style="padding:12px 0 4px;font-weight:600;color:#0f172a">${esc(l.jobTitle)}</td></tr>`);
    }
    rows.push(
      `<tr>` +
        `<td style="padding:4px 0 4px 12px;color:#334155">${esc(l.description)} <span style="color:#94a3b8">· ${LINE_KIND[l.kind]}</span></td>` +
        `<td style="padding:4px 8px;text-align:right;color:#334155;white-space:nowrap">${l.qty}${l.kind === "labor" ? " h" : ""}</td>` +
        `<td style="padding:4px 8px;text-align:right;color:#334155;white-space:nowrap">${formatMoney(l.unitPrice, false)}</td>` +
        `<td style="padding:4px 0;text-align:right;color:#0f172a;white-space:nowrap">${formatMoney(l.amount, false)}</td>` +
        `</tr>`,
    );
  });

  const sumRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:3px 0;color:${strong ? "#0f172a" : "#64748b"};${strong ? "font-weight:700;font-size:16px;border-top:2px solid #0f172a;padding-top:8px" : ""}">${esc(label)}</td>` +
    `<td style="padding:3px 0;text-align:right;color:#0f172a;${strong ? "font-weight:700;font-size:16px;border-top:2px solid #0f172a;padding-top:8px" : ""}">${value}</td></tr>`;

  const sums = [
    sumRow("Parts", formatMoney(t.parts)),
    sumRow("Labour", formatMoney(t.labor)),
    t.fees ? sumRow("Other charges", formatMoney(t.fees)) : "",
    t.discount ? sumRow("Discount", `-${formatMoney(t.discount)}`) : "",
    t.partsTax ? sumRow(`Sales tax on parts (${inv.partsTaxRate}%)`, formatMoney(t.partsTax)) : "",
    t.laborTax ? sumRow(`Tax on services (${inv.laborTaxRate}%)`, formatMoney(t.laborTax)) : "",
    sumRow("Total", formatMoney(t.total), true),
    ...payments.map((p) => sumRow(`Paid · ${PAYMENT_METHOD[p.method]}`, formatMoney(p.amount))),
    inv.status !== "void" ? sumRow("Balance due", `<b>${formatMoney(balance)}</b>`) : "",
  ].join("");

  const contact = [ws.address && esc([ws.address, ws.city].filter(Boolean).join(", ")), ws.phone && `Tel: ${esc(ws.phone)}`, ws.ntn && `NTN: ${esc(ws.ntn)}`]
    .filter(Boolean)
    .join("<br>");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;font-size:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="background:#0f172a;padding:20px 24px;color:#ffffff">
    <div style="font-size:18px;font-weight:700">${esc(ws.name)}</div>
    ${contact ? `<div style="margin-top:4px;color:#cbd5e1;font-size:12px;line-height:18px">${contact}</div>` : ""}
  </td></tr>
  <tr><td style="padding:24px">
    ${args.message.trim() ? `<p style="margin:0 0 16px;color:#334155;white-space:pre-wrap">${esc(args.message.trim())}</p>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr>
        <td style="vertical-align:top">
          <div style="color:#ea580c;font-size:20px;font-weight:700;text-transform:uppercase">${inv.status === "void" ? "Void invoice" : "Invoice"}</div>
          <div style="color:#0f172a;font-weight:600">${esc(inv.number)}</div>
          <div style="color:#64748b;font-size:12px">${when(inv.issuedAt)} · ${roNumber(args.roNumberValue)}</div>
        </td>
        <td style="vertical-align:top;text-align:right;color:#334155;font-size:13px">
          ${customer ? `<b>${esc(customer.name)}</b><br>${esc(customer.phone)}<br>` : ""}
          ${vehicle ? `${esc(vehicle.plate)} · ${esc(`${vehicle.make} ${vehicle.model} ${vehicle.year}`.trim())}` : ""}
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;font-size:13px">
      <tr style="color:#94a3b8;font-size:11px;text-transform:uppercase">
        <td style="padding:8px 0">Description</td><td style="padding:8px;text-align:right">Qty</td>
        <td style="padding:8px;text-align:right">Rate</td><td style="padding:8px 0;text-align:right">Amount</td>
      </tr>
      ${rows.join("")}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0 auto;width:280px;font-size:13px">${sums}</table>
    ${ws.printer.footer ? `<p style="margin:24px 0 0;color:#64748b;font-size:12px;text-align:center">${esc(ws.printer.footer)}</p>` : ""}
  </td></tr>
</table>
<p style="color:#94a3b8;font-size:11px;margin:12px 0 0">Sent with WorkshopPOS</p>
</td></tr></table></body></html>`;

  const text = [
    args.message.trim(),
    `${ws.name}`,
    `Invoice ${inv.number} · ${when(inv.issuedAt)} · ${roNumber(args.roNumberValue)}`,
    customer ? `Customer: ${customer.name}` : "",
    vehicle ? `Vehicle: ${vehicle.plate} ${vehicle.make} ${vehicle.model}` : "",
    "",
    ...inv.lines.map((l) => `${l.jobTitle} — ${l.description}: ${l.qty} x ${formatMoney(l.unitPrice, false)} = ${formatMoney(l.amount, false)}`),
    "",
    `Total: ${formatMoney(t.total)}`,
    ...payments.map((p) => `Paid (${PAYMENT_METHOD[p.method]}): ${formatMoney(p.amount)}`),
    inv.status !== "void" ? `Balance due: ${formatMoney(balance)}` : "",
    "",
    ws.printer.footer,
  ]
    .filter((x, i, a) => x !== "" || a[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
