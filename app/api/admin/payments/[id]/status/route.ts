import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/payment";

const ALLOWED_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PAID",
  "VERIFYING",
  "FAILED",
  "REFUNDED",
] as const;

type AllowedStatus =
  (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(
  value: unknown
): value is AllowedStatus {
  return (
    typeof value === "string" &&
    ALLOWED_STATUSES.includes(
      value.toUpperCase() as AllowedStatus
    )
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const requestedStatus = String(
      body?.status || ""
    )
      .trim()
      .toUpperCase();

    if (!isAllowedStatus(requestedStatus)) {
      return NextResponse.json(
        {
          error:
            "Invalid payment status. Choose Pending, Received, In Progress, Failed or Refunded.",
        },
        { status: 400 }
      );
    }

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (invoiceError) {
      console.error(
        "Manual payment status lookup error:",
        invoiceError
      );

      return NextResponse.json(
        {
          error:
            invoiceError.message ||
            "Could not load invoice.",
        },
        { status: 500 }
      );
    }

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found." },
        { status: 404 }
      );
    }

    const oldStatus = String(
      invoice.status || "PENDING"
    ).toUpperCase();

    if (oldStatus === requestedStatus) {
      return NextResponse.json({
        ok: true,
        changed: false,
        invoice,
      });
    }

    const actor = String(
      session.email || "admin"
    );

    const now = new Date().toISOString();

    /*
     * A manual status change is an operator override.
     *
     * In particular, when an invoice is moved back to PENDING,
     * remove the old provider/payment references. This makes the
     * invoice a clean pending invoice again and prevents an old
     * PayPal/Razorpay/other provider callback from being treated as
     * the new payment after the fee is edited.
     */
    const update: Record<
      string,
      unknown
    > = {
      status: requestedStatus,
      paid_at:
        requestedStatus === "PAID"
          ? now
          : null,
      payment_verified_at:
        requestedStatus === "PAID"
          ? now
          : null,
      payment_verified_by:
        requestedStatus === "PAID"
          ? actor
          : null,
      provider_transaction_id: null,
      razorpay_order_id: null,
      razorpay_payment_id: null,
      paypal_order_id: null,
      paypal_capture_id: null,
      wise_transfer_id: null,
      payoneer_reference: null,
    };

    if (requestedStatus === "PENDING") {
      update.payment_method = null;
      update.payment_reference = null;
    } else if (requestedStatus === "PAID") {
      /*
       * If an admin manually sets Received on an invoice that did
       * not have a payment method, record it as a manual bank/transfer
       * style verification rather than pretending it was PayPal.
       */
      update.payment_method =
        invoice.payment_method ||
        "BANK_TRANSFER";
      update.payment_reference = null;
    }

    const {
      data: updatedInvoice,
      error: updateError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedInvoice) {
      console.error(
        "Manual payment status update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            updateError?.message ||
            "Could not change payment status.",
        },
        { status: 400 }
      );
    }

    await logAudit(
      "PAYMENT_STATUS_MANUALLY_CHANGED",
      "fee_invoice",
      id,
      actor,
      {
        from: oldStatus,
        to: requestedStatus,
        amount: invoice.amount,
        currency: invoice.currency,
      }
    );

    return NextResponse.json({
      ok: true,
      changed: true,
      invoice: updatedInvoice,
    });
  } catch (error: any) {
    console.error(
      "Manual payment status error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not change payment status.",
      },
      { status: 400 }
    );
  }
}
