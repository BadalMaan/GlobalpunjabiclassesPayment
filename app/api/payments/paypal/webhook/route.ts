import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalVerifyWebhook } from "@/lib/paypal";
import {
  logPaymentEvent,
  markInvoicePaid,
  markGroupPaid,
} from "@/lib/payment";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const raw = await req.text();

    let body: any;

    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const headers = {
      "paypal-auth-algo":
        req.headers.get("paypal-auth-algo") || "",

      "paypal-cert-url":
        req.headers.get("paypal-cert-url") || "",

      "paypal-transmission-id":
        req.headers.get("paypal-transmission-id") || "",

      "paypal-transmission-sig":
        req.headers.get("paypal-transmission-sig") || "",

      "paypal-transmission-time":
        req.headers.get("paypal-transmission-time") || "",
    };

    const valid = await paypalVerifyWebhook(
      headers,
      body
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const eventId = body?.id || null;

    const inserted = await logPaymentEvent(
      null,
      "PAYPAL",
      eventId,
      body?.event_type || "unknown",
      body
    );

    if (!inserted) {
      return NextResponse.json({
        received: true,
        duplicate: true,
      });
    }

    if (
      body?.event_type !==
      "PAYMENT.CAPTURE.COMPLETED"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const capture = body?.resource;

    if (!capture) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason: "Missing PayPal capture",
      });
    }

    if (capture.status !== "COMPLETED") {
      return NextResponse.json({
        received: true,
        verified: false,
        reason: "Capture not completed",
      });
    }

    const orderId =
      capture?.supplementary_data
        ?.related_ids?.order_id;

    if (!orderId) {
      return NextResponse.json({
        received: true,
        verified: false,
        reason: "Missing PayPal order ID",
      });
    }

    const providerAmount = String(
      capture?.amount?.value || ""
    );

    const providerCurrency = String(
      capture?.amount?.currency_code || ""
    ).toUpperCase();

    if (!providerAmount || !providerCurrency) {
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

    const { data: invoice } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("*")
        .eq("paypal_order_id", orderId)
        .maybeSingle();

    if (invoice) {
      const breakdown = calculatePaymentFee(
        Number(invoice.amount),
        invoice.currency,
        "PAYPAL"
      );

      const expectedAmount =
        breakdown.totalAmount.toFixed(2);

      if (providerAmount !== expectedAmount) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type: "fee_invoice",
            entity_id: invoice.id,
            metadata: {
              paypalOrderId: orderId,
              paypalCaptureId:
                capture.id || null,

              invoiceAmount:
                Number(invoice.amount).toFixed(2),

              processingFee:
                breakdown.processingFee.toFixed(2),

              expectedTotal:
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

      if (
        providerCurrency !==
        String(invoice.currency).toUpperCase()
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type: "fee_invoice",
            entity_id: invoice.id,
            metadata: {
              paypalOrderId: orderId,
              paypalCaptureId:
                capture.id || null,

              invoiceAmount:
                Number(invoice.amount).toFixed(2),

              processingFee:
                breakdown.processingFee.toFixed(2),

              expectedTotal:
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
       * The actual PayPal TOTAL has already
       * been verified above.
       *
       * markInvoicePaid() uses the original
       * invoice amount internally.
       */
      await markInvoicePaid(
        invoice.id,
        {
          method: "PAYPAL",
          transactionId:
            capture.id || null,

          providerAmount:
            Number(invoice.amount),

          providerCurrency:
            invoice.currency,

          providerFields: {
            paypal_capture_id:
              capture.id || null,
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

    const { data: group } =
      await supabaseAdmin
        .from("payment_groups")
        .select("*")
        .eq("paypal_order_id", orderId)
        .maybeSingle();

    if (group) {
      const breakdown = calculatePaymentFee(
        Number(group.amount),
        group.currency,
        "PAYPAL"
      );

      const expectedAmount =
        breakdown.totalAmount.toFixed(2);

      if (providerAmount !== expectedAmount) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_AMOUNT_MISMATCH",
            entity_type: "payment_group",
            entity_id: group.id,
            metadata: {
              paypalOrderId: orderId,
              paypalCaptureId:
                capture.id || null,

              groupAmount:
                Number(group.amount).toFixed(2),

              processingFee:
                breakdown.processingFee.toFixed(2),

              expectedTotal:
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

      if (
        providerCurrency !==
        String(group.currency).toUpperCase()
      ) {
        await supabaseAdmin
          .from("audit_logs")
          .insert({
            actor: "paypal",
            action:
              "PAYMENT_CURRENCY_MISMATCH",
            entity_type: "payment_group",
            entity_id: group.id,
            metadata: {
              paypalOrderId: orderId,
              paypalCaptureId:
                capture.id || null,

              groupAmount:
                Number(group.amount).toFixed(2),

              processingFee:
                breakdown.processingFee.toFixed(2),

              expectedTotal:
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
       * The actual PayPal TOTAL has already
       * been verified above.
       *
       * markGroupPaid() uses the original
       * group amount internally.
       */
      await markGroupPaid(
        group.id,
        {
          method: "PAYPAL",
          transactionId:
            capture.id || null,

          providerAmount:
            Number(group.amount),

          providerCurrency:
            group.currency,

          providerFields: {
            paypal_capture_id:
              capture.id || null,
          },
        }
      );

      return NextResponse.json({
        received: true,
        verified: true,
        type: "group",
      });
    }

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
      { status: 500 }
    );
  }
}
