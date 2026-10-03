import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  razorpayFetchPayment,
  verifyRazorpayCheckoutSignature,
} from "@/lib/razorpay";
import { markGroupPaid } from "@/lib/payment";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const {
      token,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = await req.json();

    if (
      !token ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        {
          error:
            "Missing Razorpay payment details.",
        },
        { status: 400 }
      );
    }

    const {
      data: group,
      error: groupError,
    } = await supabaseAdmin
      .from("payment_groups")
      .select("*")
      .eq("secure_token", token)
      .single();

    if (
      groupError ||
      !group
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid payment link.",
        },
        { status: 404 }
      );
    }

    if (
      String(group.status).toUpperCase() ===
      "PAID"
    ) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
      });
    }

    if (
      group.razorpay_order_id !==
      razorpay_order_id
    ) {
      return NextResponse.json(
        {
          error:
            "Order does not belong to this payment group.",
        },
        { status: 400 }
      );
    }

    const signatureValid =
      verifyRazorpayCheckoutSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

    if (!signatureValid) {
      return NextResponse.json(
        {
          error:
            "Invalid Razorpay payment signature.",
        },
        { status: 401 }
      );
    }

    const payment =
      await razorpayFetchPayment(
        razorpay_payment_id
      );

    if (
      payment.status !==
      "captured"
    ) {
      return NextResponse.json(
        {
          error:
            "Razorpay payment has not been captured.",
        },
        { status: 400 }
      );
    }

    const currency = String(
      group.currency || ""
    )
      .trim()
      .toUpperCase();

    /*
     * group.amount is the ORIGINAL
     * combined class fee.
     *
     * Calculate ONE processing fee
     * on the complete group amount.
     */
    const breakdown =
      calculatePaymentFee(
        group.amount,
        currency,
        "RAZORPAY"
      );

    const expectedAmountMinor =
      Math.round(
        breakdown.totalAmount * 100
      );

    const providerAmount =
      Number(payment.amount);

    const providerCurrency =
      String(
        payment.currency || ""
      )
        .trim()
        .toUpperCase();

    /*
     * Verify Razorpay received the
     * COMPLETE customer amount.
     */
    if (
      !Number.isFinite(
        providerAmount
      ) ||
      providerAmount !==
        expectedAmountMinor
    ) {
      return NextResponse.json(
        {
          error:
            `Payment verification failed. Expected ${breakdown.currency} ${breakdown.totalAmount.toFixed(
              2
            )}, but Razorpay confirmed ${providerCurrency} ${(
              providerAmount / 100
            ).toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    if (
      providerCurrency !==
      currency
    ) {
      return NextResponse.json(
        {
          error:
            "Payment verification failed: currency does not match.",
        },
        { status: 400 }
      );
    }

    /*
     * The COMPLETE group payment has already
     * been independently verified above.
     *
     * markGroupPaid currently verifies its
     * internal group allocation against
     * group.amount, so we pass the original
     * group amount there. The real provider
     * amount was verified against
     * breakdown.totalAmount immediately above.
     */
    await markGroupPaid(
      group.id,
      {
        method:
          "RAZORPAY",

        transactionId:
          razorpay_payment_id,

        providerAmount:
          group.amount,

        providerCurrency:
          currency,

        providerFields: {
          razorpay_payment_id,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      baseAmount:
        breakdown.baseAmount,
      processingFee:
        breakdown.processingFee,
      totalAmount:
        breakdown.totalAmount,
    });
  } catch (e: any) {
    console.error(
      "Razorpay group verification error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e?.message ||
          "Verification failed.",
      },
      { status: 400 }
    );
  }
}
