"use client";

// Direct thermal printing over the Web Serial API (Chrome / Edge, desktop).
// Works with USB-serial, RS-232 and Bluetooth-serial ESC/POS receipt printers.
// Printers that only expose a USB printer driver should use browser printing.

import { useSyncExternalStore } from "react";
import { formatMoney } from "./money";
import { formatDateTime, roNumber } from "./format";
import { PAYMENT_METHOD } from "./meta";
import type { Customer, Invoice, Payment, PrinterSettings, Vehicle, Workshop } from "./types";

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(options?: object): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

const serial = (): SerialLike | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as unknown as { serial?: SerialLike }).serial;

export const serialSupported = () => !!serial();

let port: SerialPortLike | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const isPrinterConnected = () => !!port;
export function onPrinterChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Re-renders when a printer connects or disconnects. */
export function usePrinterConnected() {
  return useSyncExternalStore(onPrinterChange, isPrinterConnected, () => false);
}

async function openPort(p: SerialPortLike, baudRate: number) {
  if (port) await disconnectPrinter();
  await p.open({ baudRate });
  port = p;
  notify();
}

/** Ask the user to pick a printer. Must be called from a click. */
export async function connectPrinter(baudRate: number) {
  const s = serial();
  if (!s) throw new Error("This browser can't connect to printers directly. Use Chrome or Edge on a computer.");
  await openPort(await s.requestPort(), baudRate);
}

/** Reconnect to a printer the user already allowed, without a prompt. */
export async function reconnectPrinter(baudRate: number): Promise<boolean> {
  const ports = (await serial()?.getPorts()) ?? [];
  if (!ports.length) return false;
  await openPort(ports[0], baudRate);
  return true;
}

export async function disconnectPrinter() {
  const p = port;
  port = null;
  notify();
  try {
    await p?.close();
  } catch {
    // Port already closed or unplugged.
  }
}

async function send(bytes: Uint8Array) {
  if (!port?.writable) throw new Error("No printer connected. Connect one in Settings → Printer.");
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

// ---- ESC/POS receipt builder ---------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

const ASCII_MAP: Record<string, string> = { "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "×": "x", "•": "*" };

class EscPos {
  private bytes: number[] = [ESC, 0x40];
  constructor(readonly width: number) {}

  private push(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  text(s: string) {
    for (const ch of s) {
      const c = ASCII_MAP[ch] ?? ch;
      for (const x of c) this.bytes.push(x.charCodeAt(0) < 128 ? x.charCodeAt(0) : 0x3f);
    }
    return this;
  }
  line(s = "") {
    return this.text(s).push(0x0a);
  }
  align(a: "left" | "center" | "right") {
    return this.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }
  big(on: boolean) {
    return this.push(GS, 0x21, on ? 0x11 : 0x00);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.width));
  }
  /** Left text and right-aligned value on one line, wrapping the left text if needed. */
  row(left: string, right: string) {
    const room = this.width - right.length - 1;
    const parts = wrap(left, Math.max(room, 8));
    parts.forEach((p, i) => {
      if (i === parts.length - 1) this.line(p.padEnd(this.width - right.length) + right);
      else this.line(p);
    });
    return this;
  }
  wrapped(s: string) {
    wrap(s, this.width).forEach((l) => this.line(l));
    return this;
  }
  feed(n: number) {
    return this.push(ESC, 0x64, n);
  }
  cut() {
    return this.push(GS, 0x56, 0x42, 0x00);
  }
  build() {
    return new Uint8Array(this.bytes);
  }
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if ((cur + " " + word).trim().length > width) {
      if (cur) out.push(cur);
      cur = word.length > width ? word.slice(0, width) : word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur || !out.length) out.push(cur);
  return out;
}

export const charsPerLine = (paper: PrinterSettings["paper"]) => (paper === "58mm" ? 32 : 48);

export function buildReceipt(args: {
  workshop: Workshop;
  invoice: Invoice;
  roNumberValue: number;
  customer?: Customer;
  vehicle?: Vehicle;
  payments: Payment[];
}): Uint8Array {
  const { workshop: ws, invoice: inv, customer, vehicle, payments } = args;
  const m = (p: number) => formatMoney(p, false);
  const r = new EscPos(charsPerLine(ws.printer.paper));

  r.align("center").big(true).bold(true).wrapped(ws.name).big(false).bold(false);
  if (ws.address) r.wrapped([ws.address, ws.city].filter(Boolean).join(", "));
  if (ws.phone) r.line(`Tel: ${ws.phone}`);
  if (ws.ntn) r.line(`NTN: ${ws.ntn}`);
  r.rule("=").bold(true).line(inv.status === "void" ? "VOID INVOICE" : "SALES INVOICE").bold(false).align("left");
  r.row("Invoice", inv.number).row("Date", formatDateTime(inv.issuedAt)).row("Job card", roNumber(args.roNumberValue));
  if (customer) r.row("Customer", customer.name);
  if (vehicle) r.row("Vehicle", `${vehicle.plate}`).wrapped(`${vehicle.make} ${vehicle.model} ${vehicle.year}`.trim());
  r.rule();

  let lastJob = "";
  for (const l of inv.lines) {
    if (l.jobTitle !== lastJob) {
      r.bold(true).wrapped(l.jobTitle).bold(false);
      lastJob = l.jobTitle;
    }
    const qty = l.kind === "labor" ? `${l.qty}h` : `${l.qty}`;
    r.wrapped(`  ${l.description}`).row(`   ${qty} x ${m(l.unitPrice)}`, m(l.amount));
  }
  r.rule();
  const t = inv.totals;
  r.row("Parts", m(t.parts)).row("Labour", m(t.labor));
  if (t.fees) r.row("Other charges", m(t.fees));
  if (t.discount) r.row("Discount", `-${m(t.discount)}`);
  if (t.partsTax) r.row(`Sales tax on parts ${inv.partsTaxRate}%`, m(t.partsTax));
  if (t.laborTax) r.row(`Tax on services ${inv.laborTaxRate}%`, m(t.laborTax));
  r.bold(true).row("TOTAL (Rs)", m(t.total)).bold(false);

  const paid = payments.reduce((s, p) => s + p.amount, 0);
  for (const p of payments) r.row(`  Paid - ${PAYMENT_METHOD[p.method]}`, m(p.amount));
  if (inv.status !== "void") r.bold(true).row("Balance due", m(t.total - paid)).bold(false);
  r.rule("=").align("center");
  if (ws.printer.footer) r.wrapped(ws.printer.footer);
  return r.feed(4).cut().build();
}

export async function printReceipt(args: Parameters<typeof buildReceipt>[0]) {
  await send(buildReceipt(args));
}

export async function printTestPage(ws: Workshop) {
  const r = new EscPos(charsPerLine(ws.printer.paper));
  r.align("center").bold(true).line(ws.name).bold(false).line("Printer test - WorkshopPOS").rule().align("left");
  r.row("Paper", ws.printer.paper).row("Characters / line", String(r.width)).rule();
  await send(r.feed(4).cut().build());
}
