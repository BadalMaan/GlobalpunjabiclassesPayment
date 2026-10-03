import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalCreateOrder } from "@/lib/paypal";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

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

    const breakdown = calculatePaymentFee(
      Number(group.amount),
      group.currency,
      "PAYPAL"
    );

    const order = await paypalCreateOrder({
      amount: breakdown.totalAmount.toFixed(2),
      currency: group.currency,
      invoiceNumber: group.invoice_number,
      customId: group.id,
      returnUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/pay/group/${token}?paypal=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/pay/group/${token}?paypal=cancel`,
    });

    await supabaseAdmin
      .from("payment_groups")
      .update({
        paypal_order_id: order.id,
        status: "PROCESSING",
        payment_method: "PAYPAL",
      })
      .eq("id", group.id);

    return NextResponse.json({
      id: order.id,
      links: order.links,
      baseAmount: breakdown.baseAmount,
      processingFee: breakdown.processingFee,
      totalAmount: breakdown.totalAmount,
      currency: breakdown.currency,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Could not start PayPal" },
      { status: 400 }
    );
  }
}
