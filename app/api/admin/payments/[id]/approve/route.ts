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

  async function loadInvoice() {
    const { data, error } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Invoice lookup error:", error);
      throw error;
    }

    return data;
  }

  try {
    const invoice = await loadInvoice();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (String(invoice.status).toUpperCase() === "PAID") {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        invoice,
      });
    }

    const paymentMethod =
      invoice.payment_method || "BANK_TRANSFER";

    const actor = String(session.email || "admin");

    try {
      await markInvoicePaid(invoice.id, {
        method: paymentMethod as any,
        transactionId: invoice.payment_reference || null,
        actor,
      });
    } catch (error) {
      console.error("markInvoicePaid error:", error);

      // The helper may have saved PAID before a later task failed.
      // Trust the database's final state, not just the thrown error.
      const latestInvoice = await loadInvoice().catch(
        (lookupError) => {
          console.error(
            "Final invoice lookup error:",
            lookupError
          );
          return null;
        }
      );

      if (
        latestInvoice &&
        String(latestInvoice.status).toUpperCase() === "PAID"
      ) {
        return NextResponse.json({
          ok: true,
          alreadyPaid: false,
          invoice: latestInvoice,
          warning:
            "Payment was saved as received, but a follow-up task failed.",
        });
      }

      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not verify payment",
        },
        { status: 500 }
      );
    }

    const updatedInvoice = await loadInvoice();

    if (
      !updatedInvoice ||
      String(updatedInvoice.status).toUpperCase() !== "PAID"
    ) {
      return NextResponse.json(
        {
          error:
            "The payment update could not be confirmed in the database.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      invoice: updatedInvoice,
    });
  } catch (error) {
    console.error("Payment verification route error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify payment",
      },
      { status: 500 }
    );
  }
}
```
