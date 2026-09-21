import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureInvoice, monthStart } from "@/lib/fees";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ invoiceId: string }>;
  }
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { invoiceId } = await params;

  if (!invoiceId) {
    return NextResponse.json(
      { error: "Invoice or student ID is required" },
      { status: 400 }
    );
  }

  try {
    /*
     * First try the ID as an invoice ID.
     */
    const { data: invoice } = await supabaseAdmin
      .from("fee_invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();

    let currentInvoice = invoice;

    /*
     * If no invoice exists, try the same value as a student ID.
     *
     * This is important because the admin table can contain
     * a student without a current-month invoice yet.
     */
    if (!currentInvoice) {
      const { data: student, error: studentError } =
        await supabaseAdmin
          .from("students")
          .select("*")
          .eq("id", invoiceId)
          .maybeSingle();

      if (studentError) {
        console.error(
          "Student lookup error:",
          studentError
        );
      }

      if (student) {
        const feeMonth = monthStart(
          new Date().toISOString().slice(0, 7)
        );

        const prepared = await ensureInvoice(
          student.id,
          feeMonth
        );

        currentInvoice = prepared.invoice;
      }
    }

    if (!currentInvoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    /*
     * Individual invoice payment link.
     */
    if (currentInvoice.secure_token) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL;

      if (!siteUrl) {
        return NextResponse.json(
          {
            error:
              "NEXT_PUBLIC_SITE_URL is not configured",
          },
          { status: 500 }
        );
      }

      /*
       * Check whether this invoice belongs to
       * a combined payment group.
       */
      const { data: groupItem } =
        await supabaseAdmin
          .from("payment_group_items")
          .select("payment_group_id")
          .eq(
            "invoice_id",
            currentInvoice.id
          )
          .maybeSingle();

      if (groupItem?.payment_group_id) {
        const { data: group } =
          await supabaseAdmin
            .from("payment_groups")
            .select("secure_token")
            .eq(
              "id",
              groupItem.payment_group_id
            )
            .maybeSingle();

        if (group?.secure_token) {
          return NextResponse.json({
            ok: true,
            paymentUrl:
              `${siteUrl}/pay/group/${group.secure_token}`,
            type: "GROUP",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        paymentUrl:
          `${siteUrl}/pay/${currentInvoice.secure_token}`,
        type: "INDIVIDUAL",
        invoiceId: currentInvoice.id,
      });
    }

    return NextResponse.json(
      {
        error:
          "This invoice does not have a secure payment token.",
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error(
      "Copy payment link error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not create payment link.",
      },
      { status: 400 }
    );
  }
}
