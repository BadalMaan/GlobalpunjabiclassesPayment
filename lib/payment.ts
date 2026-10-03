import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";
import { makeInvoicePdf } from "./invoice";
import { sendEmail, paymentSuccessEmail } from "./email";
import { monthLabel } from "./fees";
import { calculatePaymentFee } from "./payment-fees";

export const PAYMENT_METHODS = [
  "RAZORPAY",
  "PAYPAL",
  "WISE",
  "BANK_TRANSFER",
  "UPI",
] as const;

export type PaymentMethod =
  typeof PAYMENT_METHODS[number];

/**
 * Payment providers that are verified automatically
 * by the provider's server response/webhook.
 */
export const AUTOMATIC_PAYMENT_METHODS = [
  "RAZORPAY",
  "PAYPAL",
] as const;

export type AutomaticPaymentMethod =
  typeof AUTOMATIC_PAYMENT_METHODS[number];

export function normalizeMoney(value: unknown) {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount");
  }

  return n.toFixed(2);
}

export function normalizeCurrency(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

export function normalizeEmail(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

/**
 * Verify HMAC signature.
 */
export function verifyHmac(
  raw: string,
  signature: string | null,
  secret: string
) {
  if (!signature || !secret) {
    return false;
  }

  const expected = createHmac(
    "sha256",
    secret
  )
    .update(raw)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

/**
 * Compare invoice amount with the amount
 * actually confirmed by the payment provider.
 *
 * Example:
 *
 * Invoice = ₹10.00
 * Provider = ₹1.00
 *
 * Result = false
 */
export function paymentMatchesInvoice(
  invoice: {
    amount: unknown;
