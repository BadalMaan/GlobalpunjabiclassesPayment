import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { razorpayCreateOrder } from "@/lib/razorpay";

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

    const { data: invoice, error: invoiceError } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("*,students(*)")
        .eq("secure_token", token)
        .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invalid payment link." },
        { status: 404 }
      );
    }

    if (invoice.status === "PAID") {
      return NextResponse.json(
        { error: "This invoice has already been paid." },
        { status: 409 }
      );
    }

    const currency = String(invoice.currency || "")
      .trim()
      .toUpperCase();

    if (
      !SUPPORTED_CURRENCIES.includes(
        currency as (typeof SUPPORTED_CURRENCIES)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: `Razorpay does not support ${currency || "this"} currency in this payment portal.`,
        },
        { status: 400 }
      );
    }

    const amount = Number(invoice.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid invoice amount." },
        { status: 400 }
      );
    }

    /*
     * Invoice amount is stored in the invoice itself.
     * The browser does not get to choose the payment amount.
     *
     * Example:
     * AUD 200 -> 20000 minor units
     * USD 69  -> 6900 minor units
     * INR 1000 -> 100000 minor units
     */
    const amountMinor = Math.round(amount * 100);

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount." },
        { status: 400 }
      );
    }

    const order = await razorpayCreateOrder({
      amountMinor,
      currency,
      receipt: invoice.invoice_number,
      notes: {
        invoice_id: invoice.id,
        student_id: invoice.student_id,
        currency,
        invoice_amount: String(amount),
      },
    });

    const { error: updateError } = await supabaseAdmin
      .from("fee_invoices")
      .update({
        razorpay_order_id: order.id,
        status: "PROCESSING",
        payment_method: "RAZORPAY",
      })
      .eq("id", invoice.id);

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

    return NextResponse.json({
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (e: any) {
    console.error("Razorpay create order error:", e);

    return NextResponse.json(
      {
        error:
          e?.message || "Could not create Razorpay order.",
      },
      { status: 400 }
    );
  }
}
