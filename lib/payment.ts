import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase";
import { makeInvoicePdf } from "./invoice";
import { sendEmail, paymentSuccessEmail } from "./email";
import { monthLabel } from "./fees";

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
    currency: unknown;
  },
  provider: {
    amount: unknown;
    currency: unknown;
  }
) {
  const invoiceAmount =
    normalizeMoney(invoice.amount);

  const providerAmount =
    normalizeMoney(provider.amount);

  const invoiceCurrency =
    normalizeCurrency(invoice.currency);

  const providerCurrency =
    normalizeCurrency(provider.currency);

  return (
    invoiceAmount === providerAmount &&
    invoiceCurrency === providerCurrency
  );
}

/**
 * Throw if the provider-confirmed payment does not
 * exactly match the invoice.
 */
export function assertPaymentMatchesInvoice(
  invoice: {
    amount: unknown;
    currency: unknown;
  },
  provider: {
    amount: unknown;
    currency: unknown;
  }
) {
  const invoiceAmount =
    normalizeMoney(invoice.amount);

  const providerAmount =
    normalizeMoney(provider.amount);

  const invoiceCurrency =
    normalizeCurrency(invoice.currency);

  const providerCurrency =
    normalizeCurrency(provider.currency);

  if (
    invoiceAmount !== providerAmount
  ) {
    throw new Error(
      `Payment amount mismatch. Invoice requires ${invoiceCurrency} ${invoiceAmount}, but provider confirmed ${providerCurrency} ${providerAmount}.`
    );
  }

  if (
    invoiceCurrency !== providerCurrency
  ) {
    throw new Error(
      `Payment currency mismatch. Invoice requires ${invoiceCurrency}, but provider confirmed ${providerCurrency}.`
    );
  }

  return true;
}

/**
 * Audit log.
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  actor?: string,
  metadata?: unknown
) {
  await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor: actor || "system",
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata || null,
    });
}

/**
 * Store provider webhook/payment events.
 *
 * event_id is used for idempotency.
 */
export async function logPaymentEvent(
  invoiceId: string | null,
  provider: string,
  eventId: string | null,
  eventType: string,
  payload: unknown
) {
  if (eventId) {
    const existing =
      await supabaseAdmin
        .from("payment_events")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();

    if (existing.data) {
      return false;
    }
  }

  const { error } =
    await supabaseAdmin
      .from("payment_events")
      .insert({
        invoice_id: invoiceId,
        provider,
        event_id: eventId,
        event_type: eventType,
        payload,
      });

  if (
    error &&
    error.code !== "23505"
  ) {
    throw error;
  }

  return !error;
}

/**
 * Safe provider fields.
 *
 * We intentionally do NOT allow arbitrary providerFields
 * to overwrite invoice status, amount, currency, etc.
 */
function safeProviderFields(
  method: PaymentMethod,
  providerFields?: Record<string, unknown>
) {
  if (!providerFields) {
    return {};
  }

  const allowed =
    method === "RAZORPAY"
      ? [
          "razorpay_payment_id",
        ]
      : method === "PAYPAL"
        ? [
            "paypal_capture_id",
          ]
        : [
            "payment_reference",
          ];

  const result: Record<
    string,
    unknown
  > = {};

  for (const key of allowed) {
    if (
      Object.prototype.hasOwnProperty.call(
        providerFields,
        key
      )
    ) {
      result[key] =
        providerFields[key];
    }
  }

  return result;
}

/**
 * Mark one invoice as PAID.
 *
 * IMPORTANT:
 *
 * RAZORPAY and PAYPAL require the actual provider-confirmed
 * amount and currency.
 *
 * BANK_TRANSFER / UPI / WISE can be marked paid by an
 * authenticated operator after manual verification.
 */
export async function markInvoicePaid(
  invoiceId: string,
  input: {
    method: PaymentMethod;

    transactionId?: string | null;

    paidAt?: string;

    actor?: string;

    /**
     * Actual amount confirmed by Razorpay/PayPal.
     */
    providerAmount?: unknown;

    /**
     * Actual currency confirmed by Razorpay/PayPal.
     */
    providerCurrency?: unknown;

    providerFields?: Record<
      string,
      unknown
    >;
  }
) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await supabaseAdmin
      .from("fee_invoices")
      .select(
        "*,students(*)"
      )
      .eq("id", invoiceId)
      .single();

  if (invoiceError) {
    throw invoiceError;
  }

  if (!invoice) {
    throw new Error(
      "Invoice not found"
    );
  }

  /**
   * Idempotency:
   * If already paid, do not send another receipt
   * or create another payment event.
   */
  if (
    String(invoice.status).toUpperCase() ===
    "PAID"
  ) {
    return invoice;
  }

  /**
   * Automatic providers MUST provide the actual
   * provider-confirmed amount and currency.
   */
  if (
    input.method === "RAZORPAY" ||
    input.method === "PAYPAL"
  ) {
    if (
      input.providerAmount ===
        undefined ||
      input.providerCurrency ===
        undefined
    ) {
      await logAudit(
        "PAYMENT_VERIFICATION_REJECTED",
        "fee_invoice",
        invoiceId,
        input.actor || "system",
        {
          method: input.method,
          reason:
            "Missing provider amount or currency",
          transactionId:
            input.transactionId || null,
        }
      );

      throw new Error(
        `${input.method} payment cannot be marked PAID without provider-confirmed amount and currency.`
      );
    }

    /**
     * Exact amount + currency verification.
     */
    try {
      assertPaymentMatchesInvoice(
        invoice,
        {
          amount:
            input.providerAmount,
          currency:
            input.providerCurrency,
        }
      );
    } catch (error: any) {
      await logAudit(
        "PAYMENT_VERIFICATION_REJECTED",
        "fee_invoice",
        invoiceId,
        input.actor || "system",
        {
          method: input.method,
          reason:
            error?.message ||
            "Amount or currency mismatch",
          invoiceAmount:
            normalizeMoney(
              invoice.amount
            ),
          invoiceCurrency:
            normalizeCurrency(
              invoice.currency
            ),
          providerAmount:
            String(
              input.providerAmount
            ),
          providerCurrency:
            normalizeCurrency(
              input.providerCurrency
            ),
          transactionId:
            input.transactionId || null,
        }
      );

      throw error;
    }
  }

  const paidAt =
    input.paidAt ||
    new Date().toISOString();

  const update: Record<
    string,
    unknown
  > = {
    status: "PAID",
    paid_at: paidAt,
    payment_verified_at:
      paidAt,
    payment_verified_by:
      input.actor || "system",
    payment_method:
      input.method,
    provider_transaction_id:
      input.transactionId || null,
  };

  /**
   * Only allow known provider-specific fields.
   */
  Object.assign(
    update,
    safeProviderFields(
      input.method,
      input.providerFields
    )
  );

  /**
   * Update only while invoice is not already PAID.
   */
  const {
    data: updated,
    error: updateError,
  } =
    await supabaseAdmin
      .from("fee_invoices")
      .update(update)
      .eq("id", invoiceId)
      .neq("status", "PAID")
      .select(
        "*,students(*)"
      )
      .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  /**
   * Another webhook/request may have paid it
   * between our initial read and update.
   */
  const finalInvoice =
    updated || invoice;

  /**
   * Only continue with receipt/audit when this
   * request actually changed the invoice to PAID.
   */
  if (
    !updated ||
    String(
      finalInvoice.status
    ).toUpperCase() !== "PAID"
  ) {
    return finalInvoice;
  }

  await logAudit(
    "PAYMENT_RECEIVED",
    "fee_invoice",
    invoiceId,
    input.actor,
    {
      method: input.method,
      transactionId:
        input.transactionId || null,
      amount:
        normalizeMoney(
          finalInvoice.amount
        ),
      currency:
        normalizeCurrency(
          finalInvoice.currency
        ),
    }
  );

  /**
   * Send paid receipt only after successful
   * payment verification.
   */
  if (
    finalInvoice.students?.parent_email
  ) {
    const pdf =
      makeInvoicePdf({
        invoiceNumber:
          finalInvoice.invoice_number,

        studentName:
          finalInvoice.students
            .student_name,

        parentName:
          finalInvoice.students
            .parent_name,

        monthLabel:
          monthLabel(
            finalInvoice.fee_month
          ),

        amount:
          String(
            finalInvoice.amount
          ),

        currency:
          finalInvoice.currency,

        paidAt,
      });

    await sendEmail({
      to:
        finalInvoice.students
          .parent_email,

      subject:
        `Payment received — ${finalInvoice.invoice_number}`,

      html:
        paymentSuccessEmail({
          studentName:
            finalInvoice.students
              .student_name,

          monthLabel:
            monthLabel(
              finalInvoice.fee_month
            ),

          amount:
            String(
              finalInvoice.amount
            ),

          currency:
            finalInvoice.currency,

          invoiceNumber:
            finalInvoice.invoice_number,

          portalUrl:
            `${process.env.NEXT_PUBLIC_SITE_URL}/pay/${finalInvoice.secure_token}`,
        }),

      attachments: [
        {
          filename:
            `${finalInvoice.invoice_number}.pdf`,

          content: pdf,

          contentType:
            "application/pdf",
        },
      ],
    });
  }

  return finalInvoice;
}

/**
 * Mark a payment group as PAID.
 *
 * For Razorpay / PayPal, the caller must supply
 * the provider-confirmed total amount and currency.
 */
export async function markGroupPaid(
  groupId: string,
  input: {
    method: PaymentMethod;

    transactionId?: string | null;

    actor?: string;

    providerAmount?: unknown;

    providerCurrency?: unknown;

    providerFields?: Record<
      string,
      unknown
    >;
  }
) {
  const {
    data: group,
    error: groupError,
  } =
    await supabaseAdmin
      .from("payment_groups")
      .select(
        "*,payment_group_items(*,fee_invoices(*,students(*)))"
      )
      .eq("id", groupId)
      .single();

  if (groupError) {
    throw groupError;
  }

  if (!group) {
    throw new Error(
      "Payment group not found"
    );
  }

  if (
    String(group.status).toUpperCase() ===
    "PAID"
  ) {
    return group;
  }

  /**
   * Automatic provider verification.
   *
   * The provider amount must equal the complete
   * merged payment group amount.
   */
  if (
    input.method === "RAZORPAY" ||
    input.method === "PAYPAL"
  ) {
    if (
      input.providerAmount ===
        undefined ||
      input.providerCurrency ===
        undefined
    ) {
      await logAudit(
        "GROUP_PAYMENT_VERIFICATION_REJECTED",
        "payment_group",
        groupId,
        input.actor || "system",
        {
          method: input.method,
          reason:
            "Missing provider amount or currency",
          transactionId:
            input.transactionId || null,
        }
      );

      throw new Error(
        `${input.method} group payment cannot be marked PAID without provider-confirmed amount and currency.`
      );
    }

    try {
      assertPaymentMatchesInvoice(
        group,
        {
          amount:
            input.providerAmount,
          currency:
            input.providerCurrency,
        }
      );
    } catch (error: any) {
      await logAudit(
        "GROUP_PAYMENT_VERIFICATION_REJECTED",
        "payment_group",
        groupId,
        input.actor || "system",
        {
          method: input.method,
          reason:
            error?.message ||
            "Amount or currency mismatch",

          groupAmount:
            normalizeMoney(
              group.amount
            ),

          groupCurrency:
            normalizeCurrency(
              group.currency
            ),

          providerAmount:
            String(
              input.providerAmount
            ),

          providerCurrency:
            normalizeCurrency(
              input.providerCurrency
            ),

          transactionId:
            input.transactionId || null,
        }
      );

      throw error;
    }
  }

  const paidAt =
    new Date().toISOString();

  const update: Record<
    string,
    unknown
  > = {
    status: "PAID",
    paid_at: paidAt,
    payment_verified_at:
      paidAt,
    payment_verified_by:
      input.actor || "system",
    payment_method:
      input.method,
    provider_transaction_id:
      input.transactionId || null,
  };

  Object.assign(
    update,
    safeProviderFields(
      input.method,
      input.providerFields
    )
  );

  const {
    data: updatedGroup,
    error: updateError,
  } =
    await supabaseAdmin
      .from("payment_groups")
      .update(update)
      .eq("id", groupId)
      .neq("status", "PAID")
      .select("*")
      .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  const finalGroup =
    updatedGroup || group;

  /**
   * Now mark each individual invoice as paid.
   *
   * IMPORTANT:
   * We pass the actual invoice amount for each child.
   * The group itself has already been verified against
   * the provider's TOTAL payment.
   */
  for (
    const item of
      group.payment_group_items || []
  ) {
    const invoice =
      item.fee_invoices;

    if (!invoice) {
      continue;
    }

    await markInvoicePaid(
      item.invoice_id,
      {
        method:
          input.method,

        transactionId:
          input.transactionId,

        actor:
          input.actor,

        /**
         * Each individual invoice must match
         * its own amount/currency.
         *
         * For a group payment, this is the internal
         * allocation amount, not the provider total.
         */
        providerAmount:
          invoice.amount,

        providerCurrency:
          invoice.currency,

        providerFields:
          input.providerFields,
      }
    );
  }

  await logAudit(
    "PAYMENT_GROUP_RECEIVED",
    "payment_group",
    groupId,
    input.actor,
    {
      method:
        input.method,

      transactionId:
        input.transactionId ||
        null,

      amount:
        normalizeMoney(
          group.amount
        ),

      currency:
        normalizeCurrency(
          group.currency
        ),
    }
  );

  return finalGroup;
}
