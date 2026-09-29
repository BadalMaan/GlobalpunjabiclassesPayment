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

function makeInvoiceNumber(studentId: string) {
  const compact = randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)
    .toUpperCase();

  return `GPC-CUSTOM-${studentId
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}-${compact}`;
}

/**
 * Returns a unique fee_month date inside the requested month.
 *
 * The database has:
 *
 *   unique(student_id, fee_month)
 *
 * The regular monthly invoice normally uses the first day
 * of the month. Custom invoices therefore use another unused
 * date within the same month.
 *
 * This keeps the custom invoice associated with the correct
 * calendar month while avoiding the uniqueness conflict.
 */
async function getUniqueCustomFeeDate(
  studentId: string,
  requestedMonth: string
) {
  const year = Number(
    requestedMonth.slice(0, 4)
  );

  const month =
    Number(requestedMonth.slice(5, 7)) - 1;

  const firstDay = new Date(
    Date.UTC(year, month, 1)
  );

  const nextMonth = new Date(
    Date.UTC(year, month + 1, 1)
  );

  const {
    data: existingInvoices,
    error,
  } = await supabaseAdmin
    .from("fee_invoices")
    .select("fee_month")
    .eq("student_id", studentId)
    .gte(
      "fee_month",
      firstDay.toISOString().slice(0, 10)
    )
    .lt(
      "fee_month",
      nextMonth.toISOString().slice(0, 10)
    );

  if (error) {
    throw error;
  }

  const usedDates = new Set(
    (existingInvoices || []).map(
      (invoice) => String(invoice.fee_month)
    )
  );

  /*
   * Start from day 2 because the normal monthly
   * invoice will normally use day 1.
   */
  const daysInMonth = new Date(
    Date.UTC(year, month + 1, 0)
  ).getUTCDate();

  for (
    let day = 2;
    day <= daysInMonth;
    day++
  ) {
    const candidate = new Date(
      Date.UTC(year, month, day)
    )
      .toISOString()
      .slice(0, 10);

    if (!usedDates.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No available invoice date remains in this month for another custom fee."
  );
}

export async function POST(req: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
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

    const amount = Number(
      body?.amount
    );

    const currency = String(
      body?.currency || ""
    )
      .trim()
      .toUpperCase();

    const description = String(
      body?.description || ""
    ).trim();

    /*
     * BASIC VALIDATION
     */

    if (!studentId) {
      return NextResponse.json(
        {
          error:
            "Student ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(month)
    ) {
      return NextResponse.json(
        {
          error:
            "A valid fee month is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1000000
    ) {
      return NextResponse.json(
        {
          error:
            "Custom amount must be greater than 0.",
        },
        {
          status: 400,
        }
      );
    }

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json(
        {
          error:
            "Unsupported currency. Use USD, AUD, CAD, NZD, GBP, EUR or INR.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * LOAD STUDENT
     */

    const {
      data: student,
      error: studentError,
    } =
      await supabaseAdmin
        .from("students")
        .select(
          "id, student_name, active, currency"
        )
        .eq("id", studentId)
        .single();

    if (
      studentError ||
      !student
    ) {
      return NextResponse.json(
        {
          error:
            "Student not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (!student.active) {
      return NextResponse.json(
        {
          error:
            "This student is inactive. Activate the student before creating a payment link.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * FIND A UNIQUE DATE WITHIN THE
     * REQUESTED MONTH.
     *
     * This avoids the database constraint:
     *
     * unique(student_id, fee_month)
     */

    const customFeeDate =
      await getUniqueCustomFeeDate(
        studentId,
        month
      );

    /*
     * CREATE SECURE PAYMENT TOKEN
     */

    const secureToken =
      randomUUID();

    const invoiceNumber =
      makeInvoiceNumber(
        studentId
      );

    const finalAmount =
      Number(
        amount.toFixed(2)
      );

    /*
     * CREATE CUSTOM INVOICE
     */

    const {
      data: invoice,
      error: invoiceError,
    } =
      await supabaseAdmin
        .from("fee_invoices")
        .insert({
          student_id: studentId,

          /*
           * Unique date inside the requested
           * month. The payment page will still
           * remain within the correct month.
           */
          fee_month:
            customFeeDate,

          amount:
            finalAmount,

          currency,

          invoice_number:
            invoiceNumber,

          secure_token:
            secureToken,

          status:
            "PENDING",

          invoice_type:
            "CUSTOM",

          description:
            description ||
            "Custom Fee",
        })
        .select("*")
        .single();

    if (
      invoiceError ||
      !invoice
    ) {
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
        {
          status: 400,
        }
      );
    }

    /*
     * SITE URL
     */

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL;

    if (!siteUrl) {
      return NextResponse.json(
        {
          error:
            "NEXT_PUBLIC_SITE_URL is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * SECURE PAYMENT URL
     */

    const paymentUrl =
      `${siteUrl}/pay/${secureToken}`;

    /*
     * RESPONSE
     */

    return NextResponse.json({
      ok: true,

      paymentUrl,

      invoice: {
        id:
          invoice.id,

        invoiceNumber,

        studentId,

        studentName:
          student.student_name,

        amount:
          finalAmount,

        currency,

        status:
          "PENDING",

        invoiceType:
          "CUSTOM",

        description:
          description ||
          "Custom Fee",

        feeMonth:
          month,

        secureToken,
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
      {
        status: 400,
      }
    );
  }
}
