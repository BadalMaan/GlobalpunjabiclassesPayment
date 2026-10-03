import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalCaptureOrder } from "@/lib/paypal";
import { markGroupPaid } from "@/lib/payment";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const { token, orderId } = await req.json();

    const { data: group } = await supabaseAdmin
      .from("payment_groups")
      .select("*")
      .eq("secure_token", token)
      .single();

    if (!group) {
      return NextResponse.json(
        { error: "Invalid link" },
        { status: 404 }
      );
    }

    if (group.status === "PAID") {
      return NextResponse.json(
        { error: "Already paid" },
        { status: 409 }
      );
    }

    if (group.paypal_order_id !== orderId) {
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

    const breakdown = calculatePaymentFee(
      Number(group.amount),
      group.currency,
      "PAYPAL"
    );

    const providerAmount = Number(capture.amount?.value);
    const providerCurrency = capture.amount?.currency_code;

    if (
      !Number.isFinite(providerAmount) ||
      providerAmount !== Number(breakdown.totalAmount.toFixed(2))
    ) {
      return NextResponse.json(
        { error: "Amount mismatch" },
        { status: 400 }
      );
    }

    if (providerCurrency !== group.currency) {
      return NextResponse.json(
        { error: "Currency mismatch" },
        { status: 400 }
      );
    }

    await markGroupPaid(group.id, {
      method: "PAYPAL",
      transactionId: capture.id,
      providerAmount: Number(group.amount),
      providerCurrency: group.currency,
      providerFields: {
        paypal_capture_id: capture.id,
      },
    });

    return NextResponse.json({
      ok: true,
      baseAmount: breakdown.baseAmount,
      processingFee: breakdown.processingFee,
      totalAmount: breakdown.totalAmount,
      currency: breakdown.currency,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "PayPal capture failed" },
      { status: 400 }
    );
  }
}
