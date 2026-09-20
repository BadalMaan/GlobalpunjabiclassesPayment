import { supabaseAdmin } from "./supabase";
import { normalizePhone } from "./payment";

function graphUrl() {
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  return `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

export async function sendWhatsAppPaymentLink(input: {
  to: string;
  studentNames: string[];
  total: string;
  currency: string;
  feeMonth: string;
  paymentUrl: string;
  logStudentId?: string | null;
  paymentGroupId?: string | null;
}) {
  const phone = normalizePhone(input.to);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const template = process.env.WHATSAPP_FEE_TEMPLATE_NAME;
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  if (!phone || !token || !process.env.WHATSAPP_PHONE_NUMBER_ID || !template) {
    return { ok: false, skipped: true, reason: "WhatsApp Cloud API is not configured" };
  }

  // Business-initiated WhatsApp messages should use an approved template.
  // Approved template uses named body variables: student_name, fee_period, monthly_fee, payment_link.
  const response = await fetch(graphUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: phone, type: "template",
      template: { name: template, language: { code: language }, components: [{ type: "body", parameters: [
        { type: "text", parameter_name: "student_name", text: input.studentNames.join(", ") },
        { type: "text", parameter_name: "fee_period", text: input.feeMonth },
        { type: "text", parameter_name: "monthly_fee", text: `${input.currency} ${input.total}` },
        { type: "text", parameter_name: "payment_link", text: input.paymentUrl }
      ] }] }
    })
  });
  const data = await response.json().catch(() => ({}));
  await supabaseAdmin.from("message_log").insert({
    student_id: input.logStudentId || null, payment_group_id: input.paymentGroupId || null,
    channel: "WHATSAPP", destination: phone, template_name: template,
    status: response.ok ? "SENT" : "FAILED", provider_message_id: data?.messages?.[0]?.id || null,
    error_message: response.ok ? null : JSON.stringify(data)
  });
  if (!response.ok) throw new Error(data?.error?.message || "WhatsApp send failed");
  return { ok: true, messageId: data?.messages?.[0]?.id || null };
}
