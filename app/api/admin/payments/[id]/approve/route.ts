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

  const { data: invoice, error: invoiceError } =
    await supabaseAdmin
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
      { error: "Could not load invoice" },
      { status: 500 }
    );
  }

  if (!invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  // Prevent unnecessary duplicate processing.
  if (String(invoice.status).toUpperCase() === "PAID") {
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

  try {
    const paymentMethod =
      invoice.payment_method ||
      "BANK_TRANSFER";

    const transactionId =
      invoice.payment_reference || null;

    const actor = String(
      session.email || "admin"
    );

    await markInvoicePaid(
      invoice.id,
      {
        method: paymentMethod as any,
        transactionId,
        actor,
      }
    );

    // Read the invoice again so the admin panel
    // receives the actual updated payment state.
    const { data: updatedInvoice } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("*")
        .eq("id", invoice.id)
        .single();

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      invoice: updatedInvoice || {
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
