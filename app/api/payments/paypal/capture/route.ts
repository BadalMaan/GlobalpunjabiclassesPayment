import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalCaptureOrder } from "@/lib/paypal";
import { markInvoicePaid } from "@/lib/payment";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const { token, orderId } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Payment token is required" },
        { status: 400 }
      );
    }

    if (!orderId) {
      return NextResponse.json(
        { error: "PayPal order ID is required" },
        { status: 400 }
      );
    }

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("*")
        .eq("secure_token", token)
        .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invalid link" },
        { status: 404 }
      );
    }

    if (String(invoice.status).toUpperCase() === "PAID") {
      return NextResponse.json(
        { error: "Already paid" },
        { status: 409 }
      );
    }

    if (invoice.paypal_order_id !== orderId) {
      return NextResponse.json(
        { error: "PayPal order mismatch" },
        { status: 400 }
      );
    }

    const result = await paypalCaptureOrder(orderId);

    const capture =
      result?.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture || capture.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 400 }
      );
    }

    const providerAmount = String(capture.amount?.value || "");

    const providerCurrency = String(
      capture.amount?.currency_code || ""
    ).toUpperCase();

    const breakdown = calculatePaymentFee(
      Number(invoice.amount),
      invoice.currency,
      "PAYPAL"
    );

    const expectedAmount = breakdown.totalAmount.toFixed(2);

    /*
     * Verify the actual amount paid to PayPal.
     */
    if (providerAmount !== expectedAmount) {
      await supabaseAdmin.from("audit_logs").insert({
        actor: "paypal",
        action: "PAYMENT_AMOUNT_MISMATCH",
        entity_type: "fee_invoice",
        entity_id: invoice.id,
        metadata: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || null,
          invoiceAmount: Number(invoice.amount).toFixed(2),
          processingFee: breakdown.processingFee.toFixed(2),
          expectedTotal: expectedAmount,
          invoiceCurrency: invoice.currency,
          providerAmount,
          providerCurrency,
        },
      });

      return NextResponse.json(
        {
          error:
            "Amount mismatch. Payment was not marked as paid.",
        },
        { status: 400 }
      );
    }

    /*
     * Verify the actual currency paid to PayPal.
     */
    if (
      providerCurrency !==
      String(invoice.currency).toUpperCase()
    ) {
      await supabaseAdmin.from("audit_logs").insert({
        actor: "paypal",
        action: "PAYMENT_CURRENCY_MISMATCH",
        entity_type: "fee_invoice",
        entity_id: invoice.id,
        metadata: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || null,
          invoiceAmount: Number(invoice.amount).toFixed(2),
          processingFee: breakdown.processingFee.toFixed(2),
          expectedTotal: expectedAmount,
          invoiceCurrency: invoice.currency,
          providerAmount,
          providerCurrency,
        },
      });

      return NextResponse.json(
        {
          error:
            "Currency mismatch. Payment was not marked as paid.",
        },
        { status: 400 }
      );
    }

    /*
     * The PayPal TOTAL has already been verified above.
     *
     * markInvoicePaid() in the restored payment.ts
     * expects the ORIGINAL invoice amount.
     */
    await markInvoicePaid(invoice.id, {
      method: "PAYPAL",
      transactionId: capture.id || null,

      providerAmount: Number(invoice.amount),

      providerCurrency: invoice.currency,

      providerFields: {
        paypal_capture_id: capture.id || null,
      },
    });

    return NextResponse.json({
      ok: true,
      verified: true,

      invoiceId: invoice.id,

      paypalOrderId: orderId,

      paypalCaptureId: capture.id || null,

      baseAmount: breakdown.baseAmount,

      processingFee: breakdown.processingFee,

      totalAmount: breakdown.totalAmount,

      currency: breakdown.currency,
    });
  } catch (error: any) {
    console.error("PayPal capture error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "PayPal capture failed",
      },
      { status: 400 }
    );
  }
}
