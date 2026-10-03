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
        { error: "Payment token is required." },
        { status: 400 }
      );
    }

    const { data: group, error: groupError } =
      await supabaseAdmin
        .from("payment_groups")
        .select("*")
        .eq("secure_token", token)
        .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: "Invalid payment link." },
        { status: 404 }
      );
    }

    if (
      String(group.status).toUpperCase() ===
      "PAID"
    ) {
      return NextResponse.json(
        { error: "This payment has already been paid." },
        { status: 409 }
      );
    }

    const currency = String(
      group.currency || ""
    )
      .trim()
      .toUpperCase();

    if (
      !SUPPORTED_CURRENCIES.includes(
        currency as (typeof SUPPORTED_CURRENCIES)[number]
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

    const amount = Number(group.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid payment group amount." },
        { status: 400 }
      );
    }

    /*
     * IMPORTANT:
     *
     * group.amount is the ORIGINAL combined
     * class-fee amount.
     *
     * We calculate ONE Razorpay processing fee
     * on the complete group payment.
     */
    const breakdown =
      calculatePaymentFee(
        amount,
        currency,
        "RAZORPAY"
      );

    const totalAmount =
      breakdown.totalAmount;

    const amountMinor =
      Math.round(totalAmount * 100);

    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid payment amount." },
        { status: 400 }
      );
    }

    const order =
      await razorpayCreateOrder({
        amountMinor,
        currency,
        receipt:
          group.invoice_number,

        notes: {
          payment_group_id:
            group.id,

          currency,

          /*
           * Original combined class fees.
           */
          invoice_amount:
            String(amount),

          /*
           * Processing charge.
           */
          processing_fee:
            breakdown.processingFee.toFixed(2),

          /*
           * Complete customer payment.
           */
          total_amount:
            breakdown.totalAmount.toFixed(2),
        },
      });

    const { error: updateError } =
      await supabaseAdmin
        .from("payment_groups")
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
          group.id
        );

    if (updateError) {
      console.error(
        "Could not update payment group after Razorpay order creation:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Razorpay order was created, but the payment group could not be updated. Please contact Global Punjabi Classes before trying again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      key:
        process.env.RAZORPAY_KEY_ID,

      orderId:
        order.id,

      amount:
        order.amount,

      currency:
        order.currency,

      baseAmount:
        breakdown.baseAmount,

      processingFee:
        breakdown.processingFee,

      totalAmount:
        breakdown.totalAmount,
    });
  } catch (e: any) {
    console.error(
      "Razorpay group create order error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e?.message ||
          "Could not create Razorpay group order.",
      },
      { status: 400 }
    );
  }
}
