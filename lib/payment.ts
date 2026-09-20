import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";
import { makeInvoicePdf } from "./invoice";
import { sendEmail, paymentSuccessEmail } from "./email";
import { monthLabel } from "./fees";

export const PAYMENT_METHODS = ["RAZORPAY", "PAYPAL", "WISE", "PAYONEER", "REMITLY", "BANK_TRANSFER", "UPI"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export function normalizeMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  return n.toFixed(2);
}

export function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

export function normalizeEmail(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function verifyHmac(raw: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function logAudit(action: string, entityType: string, entityId: string, actor?: string, metadata?: unknown) {
  await supabaseAdmin.from("audit_logs").insert({ actor: actor || "system", action, entity_type: entityType, entity_id: entityId, metadata: metadata || null });
}

export async function logPaymentEvent(invoiceId: string | null, provider: string, eventId: string | null, eventType: string, payload: unknown) {
  if (eventId) {
    const existing = await supabaseAdmin.from("payment_events").select("id").eq("event_id", eventId).maybeSingle();
    if (existing.data) return false;
  }
  const { error } = await supabaseAdmin.from("payment_events").insert({ invoice_id: invoiceId, provider, event_id: eventId, event_type: eventType, payload });
  if (error && error.code !== "23505") throw error;
  return !error;
}

export async function markInvoicePaid(invoiceId: string, input: {
  method: PaymentMethod;
  transactionId?: string | null;
  paidAt?: string;
  actor?: string;
  providerFields?: Record<string, unknown>;
}) {
  const { data: invoice } = await supabaseAdmin.from("fee_invoices").select("*,students(*)").eq("id", invoiceId).single();
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "PAID") return invoice;

  const paidAt = input.paidAt || new Date().toISOString();
  const update: Record<string, unknown> = {
    status: "PAID", paid_at: paidAt, payment_verified_at: paidAt,
    payment_verified_by: input.actor || "system", payment_method: input.method,
    provider_transaction_id: input.transactionId || null
  };
  if (input.providerFields) Object.assign(update, input.providerFields);
  const { data: updated, error } = await supabaseAdmin.from("fee_invoices").update(update).eq("id", invoiceId).neq("status", "PAID").select("*,students(*)").maybeSingle();
  if (error) throw error;
  const finalInvoice = updated || invoice;

  await logAudit("PAYMENT_RECEIVED", "fee_invoice", invoiceId, input.actor, { method: input.method, transactionId: input.transactionId || null });

  if (finalInvoice.students?.parent_email) {
    const pdf = makeInvoicePdf({
      invoiceNumber: finalInvoice.invoice_number,
      studentName: finalInvoice.students.student_name,
      parentName: finalInvoice.students.parent_name,
      monthLabel: monthLabel(finalInvoice.fee_month),
      amount: String(finalInvoice.amount), currency: finalInvoice.currency, paidAt
    });
    await sendEmail({
      to: finalInvoice.students.parent_email,
      subject: `Payment received — ${finalInvoice.invoice_number}`,
      html: paymentSuccessEmail({
        studentName: finalInvoice.students.student_name,
        monthLabel: monthLabel(finalInvoice.fee_month), amount: String(finalInvoice.amount),
        currency: finalInvoice.currency, invoiceNumber: finalInvoice.invoice_number,
        portalUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/pay/${finalInvoice.secure_token}`
      }),
      attachments: [{ filename: `${finalInvoice.invoice_number}.pdf`, content: pdf, contentType: "application/pdf" }]
    });
  }
  return finalInvoice;
}

export async function markGroupPaid(groupId: string, input: {method: PaymentMethod; transactionId?: string | null; actor?: string; providerFields?: Record<string, unknown>}) {
  const { data: group } = await supabaseAdmin.from("payment_groups").select("*,payment_group_items(*,fee_invoices(*,students(*)))").eq("id", groupId).single();
  if (!group) throw new Error("Payment group not found");
  if (group.status === "PAID") return group;
  const paidAt = new Date().toISOString();
  const update: Record<string, unknown> = { status: "PAID", paid_at: paidAt, payment_verified_at: paidAt, payment_verified_by: input.actor || "system", payment_method: input.method, provider_transaction_id: input.transactionId || null };
  if (input.providerFields) Object.assign(update, input.providerFields);
  const { data: updatedGroup, error } = await supabaseAdmin.from("payment_groups").update(update).eq("id", groupId).neq("status", "PAID").select("*").maybeSingle();
  if (error) throw error;
  for (const item of group.payment_group_items || []) {
    await markInvoicePaid(item.invoice_id, { method: input.method, transactionId: input.transactionId, actor: input.actor, providerFields: input.providerFields });
  }
  await logAudit("PAYMENT_GROUP_RECEIVED", "payment_group", groupId, input.actor, { method: input.method, transactionId: input.transactionId || null });
  return updatedGroup || group;
}
