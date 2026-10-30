"use server";

// Gmail connection status and sending invoices by email. Runs on the server only:
// the Gmail token is read with the secret key and never sent to the browser.

import { GmailDisconnectedError, revokeToken, sendGmail } from "@/lib/google";
import { invoiceEmail } from "@/lib/invoice-email";
import {
  mapCustomer, mapInvoice, mapInvoiceLine, mapPayment, mapVehicle, mapWorkshop,
  type CustomerRow, type InvoiceLineRow, type InvoiceRow, type PaymentRow, type VehicleRow, type WorkshopRow,
} from "@/lib/supabase/data";
import { adminClient, currentMember } from "@/lib/supabase/server";

export async function getEmailConnection(): Promise<{ email: string; connectedAt: string } | null> {
  const member = await currentMember(["owner", "advisor", "cashier"]);
  if (!member) return null;
  const { data } = await adminClient().from("workshop_email_accounts").select("email, connected_at").eq("workshop_id", member.workshopId).maybeSingle();
  return data ? { email: data.email, connectedAt: data.connected_at } : null;
}

export async function disconnectGmail(): Promise<{ error?: string }> {
  const member = await currentMember(["owner"]);
  if (!member) return { error: "Only the workshop owner can disconnect Gmail." };
  const admin = adminClient();
  const { data } = await admin.from("workshop_email_accounts").select("email, refresh_token").eq("workshop_id", member.workshopId).maybeSingle();
  if (!data) return {};
  await admin.from("workshop_email_accounts").delete().eq("workshop_id", member.workshopId);
  await revokeToken(data.refresh_token);
  await admin.from("audit_log").insert({
    workshop_id: member.workshopId, user_id: member.userId, action: "gmail.disconnected", entity: "workshop", entity_id: member.workshopId,
    summary: `Gmail disconnected: ${data.email}`,
  });
  return {};
}

export async function sendInvoiceEmail(input: { invoiceId: string; to: string; message: string }): Promise<{ error?: string }> {
  const member = await currentMember(["owner", "advisor", "cashier"]);
  if (!member) return { error: "You don't have permission to email invoices." };
  const to = input.to.trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) return { error: "Enter one valid email address." };
  if (input.message.length > 2000) return { error: "The message is too long." };

  // Read the invoice as the signed-in user, so row-level security keeps it inside their workshop.
  const db = member.client;
  const { data: inv } = await db.from("invoices").select("*").eq("id", input.invoiceId).maybeSingle<InvoiceRow>();
  if (!inv) return { error: "Invoice not found." };
  const [lines, pays, customer, vehicle, workshop, ro] = await Promise.all([
    db.from("invoice_lines").select("*").eq("invoice_id", inv.id).order("sort_order"),
    db.from("payments").select("*").eq("invoice_id", inv.id).order("received_at"),
    db.from("customers").select("*").eq("id", inv.customer_id).maybeSingle<CustomerRow>(),
    db.from("vehicles").select("*").eq("id", inv.vehicle_id).maybeSingle<VehicleRow>(),
    db.from("workshops").select("*").eq("id", inv.workshop_id).single<WorkshopRow>(),
    db.from("repair_orders").select("number").eq("id", inv.repair_order_id).maybeSingle<{ number: number }>(),
  ]);
  if (!workshop.data) return { error: "Workshop not found." };

  const admin = adminClient();
  const { data: account } = await admin.from("workshop_email_accounts").select("email, refresh_token").eq("workshop_id", member.workshopId).maybeSingle();
  if (!account) return { error: "Gmail isn't connected yet. The owner can connect it in Settings → Email." };

  const ws = mapWorkshop(workshop.data);
  const mail = invoiceEmail({
    workshop: ws,
    invoice: mapInvoice(inv, ((lines.data ?? []) as InvoiceLineRow[]).map(mapInvoiceLine)),
    roNumberValue: ro.data?.number ?? 0,
    customer: customer.data ? mapCustomer(customer.data) : undefined,
    vehicle: vehicle.data ? mapVehicle(vehicle.data) : undefined,
    payments: ((pays.data ?? []) as PaymentRow[]).map(mapPayment),
    message: input.message,
  });

  try {
    await sendGmail({
      refreshToken: account.refresh_token, fromName: ws.name, fromEmail: account.email, to,
      replyTo: ws.email && ws.email !== account.email ? ws.email : undefined,
      subject: mail.subject, text: mail.text, html: mail.html,
    });
  } catch (e) {
    if (e instanceof GmailDisconnectedError) {
      return { error: "The Gmail connection has expired. Ask the owner to reconnect it in Settings → Email." };
    }
    console.error("Gmail send failed:", e);
    return { error: e instanceof Error ? `Gmail: ${e.message}` : "Sending failed. Please try again." };
  }

  await admin.from("invoice_emails").insert({
    workshop_id: member.workshopId, invoice_id: inv.id, to_email: to, from_email: account.email, sent_by: member.userId,
  });
  await admin.from("audit_log").insert({
    workshop_id: member.workshopId, user_id: member.userId, action: "invoice.emailed", entity: "invoice", entity_id: inv.id,
    summary: `${inv.number} emailed to ${to}`,
  });
  return {};
}
