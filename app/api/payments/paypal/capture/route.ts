import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { paypalCaptureOrder } from "@/lib/paypal";
import { markInvoicePaid } from "@/lib/payment";

export async function POST(
  req: Request
) {
  try {
    const {
      token,
      orderId,
    } = await req.json();

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Payment token is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!orderId) {
      return NextResponse.json(
        {
          error:
            "PayPal order ID is required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Load the invoice from our database.
     *
     * The browser is NOT trusted for the amount.
     */
    const {
      data: invoice,
    } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq(
        "secure_token",
        token
      )
      .single();

    if (!invoice) {
      return NextResponse.json(
        {
          error:
            "Invalid link",
        },
        {
          status: 404,
        }
      );
    }

    if (
      String(
        invoice.status
      ).toUpperCase() === "PAID"
    ) {
      return NextResponse.json(
        {
          error:
            "Already paid",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Make sure the PayPal order being captured
     * belongs to THIS invoice.
     */
    if (
      invoice.paypal_order_id !==
      orderId
    ) {
      return NextResponse.json(
        {
          error:
            "PayPal order mismatch",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Capture the PayPal order server-side.
     */
    const result =
      await paypalCaptureOrder(
        orderId
      );

    const purchaseUnit =
      result?.purchase_units?.[0];

    const capture =
      purchaseUnit
        ?.payments
        ?.captures?.[0];

    /*
     * Payment must actually be completed.
     */
    if (
      !capture ||
      capture.status !==
        "COMPLETED"
    ) {
      return NextResponse.json(
        {
          error:
            "Payment not completed",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Provider-confirmed PayPal values.
     */
    const providerAmount =
      String(
        capture?.amount?.value ||
          ""
      );

    const providerCurrency =
      String(
        capture?.amount
          ?.currency_code ||
          ""
      ).toUpperCase();

    /*
     * Exact amount check.
     */
    const expectedAmount =
      Number(
        invoice.amount
      ).toFixed(2);

    if (
      providerAmount !==
      expectedAmount
    ) {
      await supabaseAdmin
        .from("audit_logs")
        .insert({
          actor: "paypal",
          action:
            "PAYMENT_AMOUNT_MISMATCH",
          entity_type:
            "fee_invoice",
          entity_id:
            invoice.id,
          metadata: {
            paypalOrderId:
              orderId,

            paypalCaptureId:
              capture.id ||
              null,

            invoiceAmount:
              expectedAmount,

            invoiceCurrency:
              invoice.currency,

            providerAmount,

            providerCurrency,
          },
        });

      return NextResponse.json(
        {
          error:
            "Amount mismatch. Payment was not marked as paid.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Exact currency check.
     */
    if (
      providerCurrency !==
      String(
        invoice.currency
      ).toUpperCase()
    ) {
      await supabaseAdmin
        .from("audit_logs")
        .insert({
          actor: "paypal",
          action:
            "PAYMENT_CURRENCY_MISMATCH",
          entity_type:
            "fee_invoice",
          entity_id:
            invoice.id,
          metadata: {
            paypalOrderId:
              orderId,

            paypalCaptureId:
              capture.id ||
              null,

            invoiceAmount:
              expectedAmount,

            invoiceCurrency:
              invoice.currency,

            providerAmount,

            providerCurrency,
          },
        });

      return NextResponse.json(
        {
          error:
            "Currency mismatch. Payment was not marked as paid.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Amount + currency + order all match.
     *
     * Pass the actual provider-confirmed
     * values into markInvoicePaid().
     */
    await markInvoicePaid(
      invoice.id,
      {
        method: "PAYPAL",

        transactionId:
          capture.id ||
          null,

        providerAmount,

        providerCurrency,

        providerFields: {
          paypal_capture_id:
            capture.id ||
            null,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      verified: true,
      invoiceId:
        invoice.id,
      paypalOrderId:
        orderId,
      paypalCaptureId:
        capture.id ||
        null,
    });
  } catch (error: any) {
    console.error(
      "PayPal capture error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "PayPal capture failed",
      },
      {
        status: 400,
      }
    );
  }
}
