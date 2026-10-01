import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { markInvoicePaid } from "@/lib/payment";

export async function POST(
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
    /*
     * Load the invoice first.
     */
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
        "Invoice lookup error:",
        invoiceError
      );

      return NextResponse.json(
        {
          error:
            invoiceError.message ||
            "Could not load invoice",
        },
        { status: 500 }
      );
    }

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    /*
     * Already paid:
     * Do not process it again.
     */
    if (
      String(invoice.status).toUpperCase() ===
      "PAID"
    ) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          paid_at: invoice.paid_at,
          payment_method:
            invoice.payment_method || null,
          payment_reference:
            invoice.payment_reference || null,
        },
      });
    }

    /*
     * Manual admin verification is primarily
     * intended for direct payments such as
     * Bank Transfer / UPI.
     *
     * If a payment method already exists on the
     * invoice, preserve it.
     */
    const paymentMethod =
      invoice.payment_method ||
      "BANK_TRANSFER";

    const transactionId =
      invoice.payment_reference || null;

    const actor = String(
      session.email || "admin"
    );

    /*
     * Mark the invoice paid through the central
     * payment helper.
     *
     * This keeps the payment update, audit log,
     * receipt/invoice processing and payment state
     * consistent with the rest of the application.
     */
    await markInvoicePaid(
      invoice.id,
      {
        method: paymentMethod as any,
        transactionId,
        actor,
      }
    );

    /*
     * Always read the invoice again.
     *
     * This prevents the admin UI from assuming
     * that the update succeeded when the database
     * contains a different final state.
     */
    const {
      data: updatedInvoice,
      error: updatedInvoiceError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq("id", invoice.id)
      .single();

    if (updatedInvoiceError) {
      console.error(
        "Updated invoice lookup error:",
        updatedInvoiceError
      );

      return NextResponse.json(
        {
          error:
            "Payment was processed, but the updated invoice could not be loaded.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      invoice:
        updatedInvoice || {
          ...invoice,
          status: "PAID",
        },
    });
  } catch (error: any) {
    console.error(
      "Payment verification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not verify payment",
      },
      { status: 400 }
    );
  }
}
