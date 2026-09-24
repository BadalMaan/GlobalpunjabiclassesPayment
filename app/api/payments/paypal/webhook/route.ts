import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalVerifyWebhook } from "@/lib/paypal";
import {
  logPaymentEvent,
  markInvoicePaid,
  markGroupPaid,
} from "@/lib/payment";

export async function POST(
  req: Request
) {
  try {
    /*
     * PayPal webhook signature verification
     * requires the original request body.
     */
    const raw =
      await req.text();

    let body: any;

    try {
      body =
        JSON.parse(raw);
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
     * PayPal verification headers.
     */
    const headers = {
      "paypal-auth-algo":
        req.headers.get(
          "paypal-auth-algo"
        ) || "",

      "paypal-cert-url":
        req.headers.get(
          "paypal-cert-url"
        ) || "",

      "paypal-transmission-id":
        req.headers.get(
          "paypal-transmission-id"
        ) || "",

      "paypal-transmission-sig":
        req.headers.get(
          "paypal-transmission-sig"
        ) || "",

      "paypal-transmission-time":
        req.headers.get(
          "paypal-transmission-time"
        ) || "",
    };

    /*
     * Verify webhook signature.
     */
    const valid =
      await paypalVerifyWebhook(
        headers,
        body
      );

    if (!valid) {
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

    const eventId =
      body?.id || null;

    /*
     * Store webhook event for idempotency.
     */
    const inserted =
      await logPaymentEvent(
        null,
        "PAYPAL",
        eventId,
        body?.event_type ||
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
     * We only process completed captures.
     */
    if (
      body?.event_type !==
      "PAYMENT.CAPTURE.COMPLETED"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const capture =
      body?.resource;

    if (!capture) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason:
          "Missing PayPal capture",
      });
    }

    /*
     * PayPal capture must be COMPLETED.
     */
    if (
      capture.status !==
      "COMPLETED"
    ) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason:
          "Capture not completed",
      });
    }

    /*
     * PayPal provides the original order ID
     * in supplementary_data.related_ids.
     */
    const orderId =
      capture
        ?.supplementary_data
        ?.related_ids
        ?.order_id;

    if (!orderId) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason:
          "Missing PayPal order ID",
      });
    }

    /*
     * Provider-confirmed values.
     */
    const providerAmount =
      String(
        capture?.amount?.value ||
          ""
      );

    const providerCurrency =
      String(
        capture?.amount
          ?.currency_code ||
          ""
      ).toUpperCase();

    if (
      !providerAmount ||
      !providerCurrency
    ) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason:
          "Missing provider amount or currency",
      });
    }

    /*
     * --------------------------------------------------
     * INDIVIDUAL INVOICE
     * --------------------------------------------------
     */
    const {
      data: invoice,
    } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq(
        "paypal_order_id",
        orderId
      )
      .maybeSingle();

    if (invoice) {
      /*
       * Exact amount.
       */
      const expectedAmount =
        Number(
          invoice.amount
        ).toFixed(2);

      if (
        providerAmount !==
        expectedAmount
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type:
              "fee_invoice",
            entity_id:
              invoice.id,
            metadata: {
              paypalOrderId:
                orderId,

              paypalCaptureId:
                capture.id ||
                null,

              invoiceAmount:
                expectedAmount,

              invoiceCurrency:
                invoice.currency,

              providerAmount,

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
       * Exact currency.
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
            actor: "paypal",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type:
              "fee_invoice",
            entity_id:
              invoice.id,
            metadata: {
              paypalOrderId:
                orderId,

              paypalCaptureId:
                capture.id ||
                null,

              invoiceAmount:
                expectedAmount,

              invoiceCurrency:
                invoice.currency,

              providerAmount,

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
       * Now mark the invoice PAID.
       */
      await markInvoicePaid(
        invoice.id,
        {
          method: "PAYPAL",

          transactionId:
            capture.id ||
            null,

          providerAmount,

          providerCurrency,

          providerFields: {
            paypal_capture_id:
              capture.id ||
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
     * --------------------------------------------------
     * PAYMENT GROUP
     * --------------------------------------------------
     */
    const {
      data: group,
    } = await supabaseAdmin
      .from("payment_groups")
      .select("*")
      .eq(
        "paypal_order_id",
        orderId
      )
      .maybeSingle();

    if (group) {
      /*
       * Exact group amount.
       */
      const expectedAmount =
        Number(
          group.amount
        ).toFixed(2);

      if (
        providerAmount !==
        expectedAmount
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type:
              "payment_group",
            entity_id:
              group.id,
            metadata: {
              paypalOrderId:
                orderId,

              paypalCaptureId:
                capture.id ||
                null,

              groupAmount:
                expectedAmount,

              groupCurrency:
                group.currency,

              providerAmount,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment group amount mismatch",
        });
      }

      /*
       * Exact group currency.
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
            actor: "paypal",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type:
              "payment_group",
            entity_id:
              group.id,
            metadata: {
              paypalOrderId:
                orderId,

              paypalCaptureId:
                capture.id ||
                null,

              groupAmount:
                expectedAmount,

              groupCurrency:
                group.currency,

              providerAmount,

              providerCurrency,
            },
          });

        return NextResponse.json({
          received: true,
          verified: false,
          reason:
            "Payment group currency mismatch",
        });
      }

      /*
       * Everything matches.
       *
       * Mark the entire group paid.
       */
      await markGroupPaid(
        group.id,
        {
          method: "PAYPAL",

          transactionId:
            capture.id ||
            null,

          providerAmount,

          providerCurrency,

          providerFields: {
            paypal_capture_id:
              capture.id ||
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
     * Valid PayPal webhook, but no matching
     * invoice/group exists.
     */
    return NextResponse.json({
      received: true,
      verified: false,
      reason:
        "No matching invoice or payment group",
    });
  } catch (error: any) {
    console.error(
      "PayPal webhook error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "PayPal webhook processing failed",
      },
      {
        status: 500,
      }
    );
  }
}
