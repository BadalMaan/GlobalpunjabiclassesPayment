import { createHmac } from "crypto";

const base = "https://api.razorpay.com/v1";

async function authHeader() {
  return `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

export async function razorpayCreateOrder(input: {amountMinor: number; currency: string; receipt: string; notes?: Record<string,string>}) {
  const r = await fetch(`${base}/orders`, {
    method: "POST", headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt, notes: input.notes || {} }), cache: "no-store"
  });
  if (!r.ok) throw new Error(`Razorpay order error: ${await r.text()}`);
  return r.json();
}

export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

export function verifyRazorpayWebhook(raw: string, signature: string | null) {
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  return expected === signature;
}

export async function razorpayFetchPayment(paymentId: string) {
  const r = await fetch(`${base}/payments/${paymentId}`, { headers: { Authorization: await authHeader() }, cache: "no-store" });
  if (!r.ok) throw new Error(`Razorpay payment lookup error: ${await r.text()}`);
  return r.json();
}
