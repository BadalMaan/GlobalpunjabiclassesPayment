import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { razorpayCreateOrder } from "@/lib/razorpay";
import { calculatePaymentFee } from "@/lib/payment-fees";

const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "CAD",
  "AUD",
  "GBP",
  "EUR",
  "NZD",
] as const;

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Payment token is required.",
        },
        { status: 400 }
      );
    }

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .select("*,students(*)")
      .eq("secure_token", token)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        {
          error:
            "Invalid payment link.",
        },
        { status: 404 }
      );
    }

    if (
      String(invoice.status).toUpperCase() ===
      "PAID"
    ) {
      return NextResponse.json(
        {
          error:
            "This invoice has already been paid.",
        },
        { status: 409 }
      );
    }

    const currency = String(
      invoice.currency || ""
    )
      .trim()
      .toUpperCase();

    if (
      !SUPPORTED_CURRENCIES.includes(
        currency as
          (typeof SUPPORTED_CURRENCIES)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: `Razorpay does not support ${
            currency || "this"
          } currency in this payment portal.`,
        },
        { status: 400 }
      );
    }

    const amount = Number(
      invoice.amount
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid invoice amount.",
        },
        { status: 400 }
      );
    }

    /*
     * IMPORTANT:
     *
     * invoice.amount is ALWAYS the original
     * class fee.
     *
     * The browser does not choose the amount.
     *
     * We calculate the Razorpay processing
     * charge again on the server.
     */
    const breakdown =
      calculatePaymentFee(
        amount,
        currency,
        "RAZORPAY"
      );

    /*
     * Razorpay receives the FULL CUSTOMER
     * PAYMENT amount:
     *
     * class fee + processing fee
     */
    const totalAmount =
      breakdown.totalAmount;

    const amountMinor =
      Math.round(
        totalAmount * 100
      );

    if (
      !Number.isSafeInteger(
        amountMinor
      ) ||
      amountMinor <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid payment amount.",
        },
        { status: 400 }
      );
    }

    const order =
      await razorpayCreateOrder({
        amountMinor,
        currency,
        receipt:
          invoice.invoice_number,

        notes: {
          invoice_id:
            invoice.id,

          student_id:
            invoice.student_id,

          currency,

          /*
           * Original class fee.
           */
          invoice_amount:
            String(amount),

          /*
           * Processing charge.
           */
          processing_fee:
            breakdown.processingFee.toFixed(
              2
            ),

          /*
           * Complete customer payment.
           */
          total_amount:
            breakdown.totalAmount.toFixed(
              2
            ),
        },
      });

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .update({
        razorpay_order_id:
          order.id,

        status:
          "PROCESSING",

        payment_method:
          "RAZORPAY",
      })
      .eq(
        "id",
        invoice.id
      );

    if (updateError) {
      console.error(
        "Could not update invoice after Razorpay order creation:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Razorpay order was created, but the invoice could not be updated. Please contact Global Punjabi Classes before trying again.",
        },
        { status: 500 }
      );
    }

    /*
     * Return the provider amount to the
     * browser.
     *
     * order.amount is already in the
     * smallest currency unit.
     */
    return NextResponse.json({
      key:
        process.env
          .RAZORPAY_KEY_ID,

      orderId:
        order.id,

      amount:
        order.amount,

      currency:
        order.currency,

      /*
       * These are useful for the UI/debugging.
       *
       * The browser should NEVER be trusted
       * for the actual payment amount.
       */
      baseAmount:
        breakdown.baseAmount,

      processingFee:
        breakdown.processingFee,

      totalAmount:
        breakdown.totalAmount,
    });
  } catch (e: any) {
    console.error(
      "Razorpay create order error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e?.message ||
          "Could not create Razorpay order.",
      },
      { status: 400 }
    );
  }
}
