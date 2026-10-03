import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  razorpayFetchPayment,
  verifyRazorpayCheckoutSignature,
} from "@/lib/razorpay";
import { markInvoicePaid } from "@/lib/payment";
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
        { error: "Missing Razorpay payment details." },
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
        { error: "Invalid payment link." },
        { status: 404 }
      );
    }

    if (String(invoice.status).toUpperCase() === "PAID") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    if (invoice.razorpay_order_id !== razorpay_order_id) {
      return NextResponse.json(
        { error: "Order does not belong to this invoice." },
        { status: 400 }
      );
    }

    if (
      !verifyRazorpayCheckoutSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      )
    ) {
      return NextResponse.json(
        { error: "Invalid payment signature." },
        { status: 401 }
      );
    }

    const payment = await razorpayFetchPayment(
      razorpay_payment_id
    );

    if (payment.status !== "captured") {
      return NextResponse.json(
        { error: "Razorpay payment has not been captured." },
        { status: 400 }
      );
    }

    const breakdown = calculatePaymentFee(
      invoice.amount,
      invoice.currency,
      "RAZORPAY"
    );

    const expectedAmountMinor = Math.round(
      breakdown.totalAmount * 100
    );

    const providerAmount = Number(payment.amount);
    const providerCurrency = String(payment.currency || "")
      .trim()
      .toUpperCase();
    const invoiceCurrency = String(invoice.currency || "")
      .trim()
      .toUpperCase();

    if (providerAmount !== expectedAmountMinor) {
      return NextResponse.json(
        {
          error:
            `Payment verification failed: Razorpay confirmed ${providerCurrency} ${(providerAmount / 100).toFixed(2)}, but the required total is ${invoiceCurrency} ${breakdown.totalAmount.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    if (providerCurrency !== invoiceCurrency) {
      return NextResponse.json(
        {
          error:
            `Payment currency mismatch. Expected ${invoiceCurrency}, received ${providerCurrency}.`,
        },
        { status: 400 }
      );
    }

    /*
     * The route has already verified the provider's FULL customer
     * payment amount above.
     *
     * markInvoicePaid currently keeps invoice.amount as the original
     * class fee, so we pass that original amount to its existing
     * central check. The provider-total verification is enforced here.
     */
    await markInvoicePaid(invoice.id, {
      method: "RAZORPAY",
      transactionId: razorpay_payment_id,
      providerAmount: invoice.amount,
      providerCurrency: invoice.currency,
      providerFields: {
        razorpay_payment_id,
      },
    });

    return NextResponse.json({
      ok: true,
      baseAmount: breakdown.baseAmount,
      processingFee: breakdown.processingFee,
      totalAmount: breakdown.totalAmount,
    });
  } catch (e: any) {
    console.error("Razorpay payment verification error:", e);

    return NextResponse.json(
      {
        error: e?.message || "Verification failed.",
      },
      { status: 400 }
    );
  }
}
