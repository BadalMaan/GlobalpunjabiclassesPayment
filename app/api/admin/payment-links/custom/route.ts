import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const SUPPORTED_CURRENCIES = [
  "USD",
  "AUD",
  "CAD",
  "NZD",
  "GBP",
  "EUR",
  "INR",
] as const;

function isSupportedCurrency(
  value: string
): value is (typeof SUPPORTED_CURRENCIES)[number] {
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number]
  );
}

function makeInvoiceNumber(
  studentId: string
) {
  const compact = randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)
    .toUpperCase();

  return `GPC-CUSTOM-${studentId
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}-${compact}`;
}

export async function POST(req: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const studentId = String(
      body?.studentId || ""
    ).trim();

    const month = String(
      body?.month || ""
    ).trim();

    const amount = Number(body?.amount);

    const currency = String(
      body?.currency || ""
    )
      .trim()
      .toUpperCase();

    if (!studentId) {
      return NextResponse.json(
        { error: "Student ID is required." },
        { status: 400 }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(month)
    ) {
      return NextResponse.json(
        { error: "A valid fee month is required." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000
    ) {
      return NextResponse.json(
        { error: "Custom amount must be greater than 0." },
        { status: 400 }
      );
    }

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json(
        {
          error:
            "Unsupported currency. Use USD, AUD, CAD, NZD, GBP, EUR or INR.",
        },
        { status: 400 }
      );
    }

    const {
      data: student,
      error: studentError,
    } = await supabaseAdmin
      .from("students")
      .select(
        "id, student_name, active, currency"
      )
      .eq("id", studentId)
      .single();

    if (studentError || !student) {
      return NextResponse.json(
        { error: "Student not found." },
        { status: 404 }
      );
    }

    if (!student.active) {
      return NextResponse.json(
        {
          error:
            "This student is inactive. Activate the student before creating a payment link.",
        },
        { status: 400 }
      );
    }

    const secureToken = randomUUID();

    const invoiceNumber =
      makeInvoiceNumber(studentId);

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .insert({
        student_id: studentId,
        fee_month: month,
        amount: Number(amount.toFixed(2)),
        currency,
        invoice_number: invoiceNumber,
        secure_token: secureToken,
        status: "PENDING",
      })
      .select("*")
      .single();

    if (invoiceError || !invoice) {
      console.error(
        "Custom invoice creation error:",
        invoiceError
      );

      return NextResponse.json(
        {
          error:
            invoiceError?.message ||
            "Could not create custom payment invoice.",
        },
        { status: 400 }
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

    const paymentUrl =
      `${siteUrl}/pay/${secureToken}`;

    return NextResponse.json({
      ok: true,
      paymentUrl,
      invoice: {
        id: invoice.id,
        invoiceNumber,
        studentId,
        studentName: student.student_name,
        amount: Number(amount.toFixed(2)),
        currency,
        status: "PENDING",
      },
    });
  } catch (error: any) {
    console.error(
      "Custom payment-link error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not create custom payment link.",
      },
      { status: 400 }
    );
  }
}
