const base = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`PayPal token error: ${await r.text()}`);
  const data = await r.json();
  return data.access_token as string;
}

export async function paypalCreateOrder(input: {
  amount: string;
  currency: string;
  invoiceNumber: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const token = await getAccessToken();
  const r = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `gpc-${input.customId}-${Date.now()}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        invoice_id: input.invoiceNumber,
        custom_id: input.customId,
        amount: {
          currency_code: input.currency,
          value: input.amount
        }
      }],
      application_context: {
        brand_name: "Global Punjabi Classes",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl
      }
    }),
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`PayPal create order error: ${await r.text()}`);
  return r.json();
}

export async function paypalCaptureOrder(orderId: string) {
  const token = await getAccessToken();
  const r = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture-${orderId}-${Date.now()}`
    },
    body: "{}",
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`PayPal capture error: ${await r.text()}`);
  return r.json();
}

export async function paypalVerifyWebhook(headers: Record<string,string>, body: unknown) {
  const token = await getAccessToken();
  const r = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: body
    })
  });
  if (!r.ok) return false;
  const data = await r.json();
  return data.verification_status === "SUCCESS";
}
