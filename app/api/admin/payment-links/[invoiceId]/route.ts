import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
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
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const {
    data: invoice,
    error: invoiceError,
  } = await supabaseAdmin
    .from("fee_invoices")
    .select(
      "id, secure_token, payment_group_id"
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_SITE_URL is not configured.",
      },
      { status: 500 }
    );
  }

  if (invoice.payment_group_id) {
    const {
      data: group,
      error: groupError,
    } = await supabaseAdmin
      .from("payment_groups")
      .select("secure_token")
      .eq(
        "id",
        invoice.payment_group_id
      )
      .single();

    if (groupError || !group?.secure_token) {
      return NextResponse.json(
        {
          error:
            "Combined payment link is not available yet.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl:
        `${siteUrl}/pay/group/${group.secure_token}`,
    });
  }

  if (!invoice.secure_token) {
    return NextResponse.json(
      {
        error:
          "Payment link is not available yet. Please use Send Link first.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    paymentUrl:
      `${siteUrl}/pay/${invoice.secure_token}`,
  });
}
