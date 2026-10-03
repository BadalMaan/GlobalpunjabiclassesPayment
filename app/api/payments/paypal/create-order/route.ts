import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalCreateOrder } from "@/lib/paypal";
import { calculatePaymentFee } from "@/lib/payment-fees";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Payment token is required." },
        { status: 400 }
      );
    }

    const { data: invoice, error } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("*")
        .eq("secure_token", token)
        .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invalid payment link." },
        { status: 404 }
      );
    }

    if (
      String(invoice.status).toUpperCase() ===
      "PAID"
    ) {
      return NextResponse.json(
        { error: "Already paid." },
        { status: 409 }
      );
    }

    const currency = String(
      invoice.currency || ""
    )
      .trim()
      .toUpperCase();

    const amount = Number(
      invoice.amount
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid invoice amount." },
        { status: 400 }
      );
    }

    /*
     * invoice.amount is the ORIGINAL
     * class fee.
     *
     * PayPal order is created for:
     *
     * Class Fee + Processing Fee
     */
    const breakdown =
      calculatePaymentFee(
        amount,
        currency,
        "PAYPAL"
      );

    const order =
      await paypalCreateOrder({
        amount:
          breakdown.totalAmount.toFixed(2),

        currency,

        invoiceNumber:
          invoice.invoice_number,

        customId:
          invoice.id,

        returnUrl:
          `${process.env.NEXT_PUBLIC_SITE_URL}/pay/${token}?paypal=success`,

        cancelUrl:
          `${process.env.NEXT_PUBLIC_SITE_URL}/pay/${token}?paypal=cancel`,
      });

    const { error: updateError } =
      await supabaseAdmin
        .from("fee_invoices")
        .update({
          paypal_order_id:
            order.id,

          status:
            "PROCESSING",

          payment_method:
            "PAYPAL",
        })
        .eq(
          "id",
          invoice.id
        );

    if (updateError) {
      console.error(
        "Could not update invoice after PayPal order creation:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "PayPal order was created, but the invoice could not be updated.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id:
        order.id,

      links:
        order.links,

      baseAmount:
        breakdown.baseAmount,

      processingFee:
        breakdown.processingFee,

      totalAmount:
        breakdown.totalAmount,
    });
  } catch (e: any) {
    console.error(
      "PayPal create order error:",
      e
    );

    return NextResponse.json(
      {
        error:
          e?.message ||
          "Could not start PayPal.",
      },
      { status: 400 }
    );
  }
}
