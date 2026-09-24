import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyRazorpayWebhook } from "@/lib/razorpay";
import {
  logPaymentEvent,
  markInvoicePaid,
  markGroupPaid,
} from "@/lib/payment";

export async function POST(req: Request) {
  try {
    /*
     * Read the raw request body first.
     * Razorpay signature verification must use
     * the original raw body.
     */
    const raw = await req.text();

    const signature =
      req.headers.get(
        "x-razorpay-signature"
      );

    /*
     * Verify Razorpay webhook signature.
     */
    if (
      !verifyRazorpayWebhook(
        raw,
        signature
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid signature",
        },
        {
          status: 401,
        }
      );
    }

    let body: any;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Razorpay event ID.
     *
     * Used for idempotency so the same webhook
     * cannot process the payment twice.
     */
    const eventId =
      req.headers.get(
        "x-razorpay-event-id"
      ) ||
      body?.id ||
      null;

    const payment =
      body?.payload?.payment?.entity;

    const order =
      body?.payload?.order?.entity;

    /*
     * Get the Razorpay order ID.
     */
    const orderId =
      payment?.order_id ||
      order?.id ||
      null;

    let invoiceId:
      | string
      | null = null;

    let groupId:
      | string
      | null = null;

    /*
     * Find the invoice/group belonging to
     * this Razorpay order.
     */
    if (orderId) {
      const {
        data: invoice,
        error: invoiceLookupError,
      } = await supabaseAdmin
        .from("fee_invoices")
        .select(
          "id,razorpay_order_id"
        )
        .eq(
          "razorpay_order_id",
          orderId
        )
        .maybeSingle();

      if (invoiceLookupError) {
        console.error(
          "Razorpay invoice lookup error:",
          invoiceLookupError
        );
      }

      invoiceId =
        invoice?.id || null;

      /*
       * If it is not an individual invoice,
       * check whether it is a merged payment group.
       */
      if (!invoiceId) {
        const {
          data: group,
          error: groupLookupError,
        } = await supabaseAdmin
          .from("payment_groups")
          .select(
            "id,razorpay_order_id"
          )
          .eq(
            "razorpay_order_id",
            orderId
          )
          .maybeSingle();

        if (groupLookupError) {
          console.error(
            "Razorpay group lookup error:",
            groupLookupError
          );
        }

        groupId =
          group?.id || null;
      }
    }

    /*
     * Save webhook event.
     *
     * If the same event was already processed,
     * stop here.
     */
    const inserted =
      await logPaymentEvent(
        invoiceId,
        "RAZORPAY",
        eventId,
        body?.event ||
          body?.type ||
          "unknown",
        body
      );

    if (!inserted) {
      return NextResponse.json({
        received: true,
        duplicate: true,
      });
    }

    /*
     * Only payment.captured and order.paid
     * are considered successful events.
     */
    const successfulEvent =
      body?.event ===
        "payment.captured" ||
      body?.event ===
        "order.paid";

    /*
     * Razorpay payment must actually be captured.
     */
    const paymentCaptured =
      payment?.status ===
      "captured";

    if (
      !successfulEvent ||
      !paymentCaptured
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    /*
     * Provider-confirmed values.
     *
     * Razorpay amount is in the smallest
     * currency unit, e.g. paise for INR.
     */
    const providerAmountMinor =
      Number(payment?.amount);

    const providerCurrency =
      String(
        payment?.currency || ""
      ).toUpperCase();

    if (
      !Number.isFinite(
        providerAmountMinor
      ) ||
      providerAmountMinor <= 0 ||
      !providerCurrency
    ) {
      await supabaseAdmin
        .from("audit_logs")
        .insert({
          actor: "razorpay",
          action:
            "PAYMENT_VERIFICATION_REJECTED",
          entity_type:
            invoiceId
              ? "fee_invoice"
              : "payment_group",
          entity_id:
            invoiceId ||
            groupId ||
            "unknown",
          metadata: {
            reason:
              "Razorpay payment did not contain a valid amount/currency",
            paymentId:
              payment?.id ||
              null,
            orderId,
          },
        });

      return NextResponse.json({
        received: true,
        verified: false,
      });
    }

    /*
     * --------------------------------------------------
     * MERGED PAYMENT GROUP
     * --------------------------------------------------
     */
    if (groupId) {
      const {
        data: group,
      } = await supabaseAdmin
        .from("payment_groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (!group) {
        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment group not found",
        });
      }

      /*
       * Razorpay amount is minor units.
       *
       * Example:
       * Group = ₹100.00
       * Razorpay = 10000 paise
       */
      const expectedAmountMinor =
        Math.round(
          Number(group.amount) *
            100
        );

      /*
       * FIRST SECURITY CHECK:
       *
       * Razorpay amount must exactly equal
       * the payment group's total.
       *
       * ₹100 invoice/group
       * ₹1 payment
       *
       * => rejected
       */
      if (
        providerAmountMinor !==
        expectedAmountMinor
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "razorpay",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type:
              "payment_group",
            entity_id:
              group.id,
            metadata: {
              paymentId:
                payment?.id ||
                null,

              orderId,

              invoiceAmount:
                Number(
                  group.amount
                ),

              invoiceCurrency:
                group.currency,

              providerAmountMinor,

              providerAmount:
                providerAmountMinor /
                100,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment amount mismatch",
        });
      }

      /*
       * SECOND SECURITY CHECK:
       *
       * Currency must exactly match.
       */
      if (
        providerCurrency !==
        String(
          group.currency
        ).toUpperCase()
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "razorpay",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type:
              "payment_group",
            entity_id:
              group.id,
            metadata: {
              paymentId:
                payment?.id ||
                null,

              orderId,

              invoiceCurrency:
                group.currency,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment currency mismatch",
        });
      }

      /*
       * BOTH amount and currency are correct.
       *
       * Pass the provider-confirmed values into
       * markGroupPaid().
       */
      await markGroupPaid(
        group.id,
        {
          method: "RAZORPAY",

          transactionId:
            payment?.id ||
            null,

          providerAmount:
            providerAmountMinor /
            100,

          providerCurrency,

          providerFields: {
            razorpay_payment_id:
              payment?.id ||
              null,
          },
        }
      );

      return NextResponse.json({
        received: true,
        verified: true,
        type: "group",
      });
    }

    /*
     * --------------------------------------------------
     * INDIVIDUAL INVOICE
     * --------------------------------------------------
     */
    if (invoiceId) {
      const {
        data: invoice,
      } = await supabaseAdmin
        .from("fee_invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (!invoice) {
        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Invoice not found",
        });
      }

      /*
       * Razorpay amount is minor units.
       */
      const expectedAmountMinor =
        Math.round(
          Number(invoice.amount) *
            100
        );

      /*
       * EXACT AMOUNT CHECK
       */
      if (
        providerAmountMinor !==
        expectedAmountMinor
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "razorpay",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type:
              "fee_invoice",
            entity_id:
              invoice.id,
            metadata: {
              paymentId:
                payment?.id ||
                null,

              orderId,

              invoiceAmount:
                Number(
                  invoice.amount
                ),

              invoiceCurrency:
                invoice.currency,

              providerAmountMinor,

              providerAmount:
                providerAmountMinor /
                100,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment amount mismatch",
        });
      }

      /*
       * EXACT CURRENCY CHECK
       */
      if (
        providerCurrency !==
        String(
          invoice.currency
        ).toUpperCase()
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "razorpay",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type:
              "fee_invoice",
            entity_id:
              invoice.id,
            metadata: {
              paymentId:
                payment?.id ||
                null,

              orderId,

              invoiceCurrency:
                invoice.currency,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment currency mismatch",
        });
      }

      /*
       * Everything matches.
       *
       * Only NOW can the invoice become PAID.
       */
      await markInvoicePaid(
        invoice.id,
        {
          method: "RAZORPAY",

          transactionId:
            payment?.id ||
            null,

          providerAmount:
            providerAmountMinor /
            100,

          providerCurrency,

          providerFields: {
            razorpay_payment_id:
              payment?.id ||
              null,
          },
        }
      );

      return NextResponse.json({
        received: true,
        verified: true,
        type: "invoice",
      });
    }

    /*
     * Webhook was valid but we couldn't associate
     * the payment with an invoice/group.
     */
    return NextResponse.json({
      received: true,
      verified: false,
      reason:
        "No matching invoice or payment group",
    });
  } catch (error: any) {
    console.error(
      "Razorpay webhook error:",
      error
    );

    /*
     * Return 500 so Razorpay can retry if appropriate.
     */
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Razorpay webhook processing failed",
      },
      {
        status: 500,
      }
    );
  }
}
