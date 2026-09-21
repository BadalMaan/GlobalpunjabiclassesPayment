import { NextResponse, after } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

import {
  ensureInvoice,
  monthLabel,
  monthStart,
} from "@/lib/fees";

import {
  feeEmail,
  sendEmail,
} from "@/lib/email";

import {
  sendWhatsAppPaymentLink,
} from "@/lib/whatsapp";

import {
  normalizeEmail,
  normalizePhone,
  logAudit,
} from "@/lib/payment";

/**
 * Find other active students belonging to the same parent.
 *
 * We search directly instead of loading every active student.
 */
async function matchingStudents(student: any) {
  const email = normalizeEmail(
    student.parent_email
  );

  const phone = normalizePhone(
    student.whatsapp_phone ||
      student.parent_phone
  );

  if (!email && !phone) {
    return [];
  }

  const results: any[] = [];

  /*
   * Search by email.
   */
  if (email) {
    const { data: emailMatches } =
      await supabaseAdmin
        .from("students")
        .select("*")
        .eq("active", true)
        .ilike("parent_email", email);

    if (emailMatches) {
      results.push(...emailMatches);
    }
  }

  /*
   * Search by phone.
   *
   * This assumes phone numbers are stored in normalized
   * form, which matches the existing normalizePhone flow.
   */
  if (phone) {
    const { data: phoneMatches } =
      await supabaseAdmin
        .from("students")
        .select("*")
        .eq("active", true)
        .or(
          `whatsapp_phone.eq.${phone},parent_phone.eq.${phone}`
        );

    if (phoneMatches) {
      results.push(...phoneMatches);
    }
  }

  /*
   * Remove duplicates and current student.
   */
  const unique = new Map<string, any>();

  for (const item of results) {
    if (
      item.id &&
      item.id !== student.id
    ) {
      unique.set(item.id, item);
    }
  }

  return Array.from(
    unique.values()
  ).sort(
    (a, b) =>
      Number(a.serial_number || 0) -
      Number(b.serial_number || 0)
  );
}

/**
 * Prepare invoice/payment link.
 *
 * This part completes before the admin request returns.
 * Email and WhatsApp delivery happen afterwards.
 */
async function preparePaymentLink(
  students: any[],
  feeMonth: string,
  actor: string
) {
  if (!students.length) {
    throw new Error(
      "No students selected"
    );
  }

  /*
   * All children in a merged payment must
   * use the same currency.
   */
  const currencies = new Set(
    students.map((student) =>
      String(
        student.currency || ""
      ).toUpperCase()
    )
  );

  if (currencies.size !== 1) {
    throw new Error(
      "Students with different currencies cannot be merged into one payment link"
    );
  }

  /*
   * Create/find invoices for this month.
   */
  const prepared: any[] = [];

  for (const student of students) {
    prepared.push(
      await ensureInvoice(
        student.id,
        feeMonth
      )
    );
  }

  if (!prepared.length) {
    throw new Error(
      "Could not prepare invoice"
    );
  }

  const currency =
    prepared[0].invoice.currency;

  const total = prepared
    .reduce(
      (
        sum: number,
        item: any
      ) =>
        sum +
        Number(
          item.invoice.amount
        ),
      0
    )
    .toFixed(2);

  /*
   * Parent email.
   */
  const sameEmail =
    students
      .map((student) =>
        normalizeEmail(
          student.parent_email
        )
      )
      .find(Boolean) || "";

  /*
   * Parent WhatsApp/phone.
   */
  const samePhone =
    students
      .map((student) =>
        normalizePhone(
          student.whatsapp_phone ||
            student.parent_phone
        )
      )
      .find(Boolean) || "";

  const names =
    students.map(
      (student) =>
        student.student_name
    );

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not configured"
    );
  }

  let paymentUrl = "";
  let groupId:
    | string
    | null = null;

  /*
   * ONE CHILD
   */
  if (prepared.length === 1) {
    const token =
      prepared[0]
        ?.invoice
        ?.secure_token;

    if (!token) {
      throw new Error(
        "Invoice does not have a secure payment token"
      );
    }

    paymentUrl =
      `${siteUrl}/pay/${token}`;
  }

  /*
   * MULTIPLE CHILDREN
   */
  else {
    const invoiceNumber =
      `GPC-${feeMonth
        .slice(0, 7)
        .replace("-", "")}-GRP-${Date.now()
        .toString()
        .slice(-6)}`;

    const {
      data: group,
      error: groupError,
    } = await supabaseAdmin
      .from("payment_groups")
      .insert({
        fee_month:
          feeMonth,

        amount:
          Number(total),

        currency,

        invoice_number:
          invoiceNumber,
      })
      .select("*")
      .single();

    if (
      groupError ||
      !group
    ) {
      throw (
        groupError ||
        new Error(
          "Could not create payment group"
        )
      );
    }

    groupId =
      group.id;

    const items =
      prepared.map(
        (item: any) => ({
          payment_group_id:
            group.id,

          invoice_id:
            item.invoice.id,

          amount:
            item.invoice.amount,
        })
      );

    const {
      error: itemError,
    } = await supabaseAdmin
      .from(
        "payment_group_items"
      )
      .insert(items);

    if (itemError) {
      throw itemError;
    }

    if (!group.secure_token) {
      throw new Error(
        "Payment group does not have a secure payment token"
      );
    }

    paymentUrl =
      `${siteUrl}/pay/group/${group.secure_token}`;

    await logAudit(
      "PAYMENT_LINK_MERGED",
      "payment_group",
      group.id,
      actor,
      {
        studentIds:
          students.map(
            (student) =>
              student.id
          ),

        total,

        currency,
      }
    );
  }

  if (
    !sameEmail &&
    !samePhone
  ) {
    throw new Error(
      "No parent email or WhatsApp number is available"
    );
  }

  const invoiceId =
    groupId ||
    prepared[0].invoice.id;

  return {
    paymentUrl,

    groupId,

    studentIds:
      students.map(
        (student) =>
          student.id
      ),

    total,

    currency,

    names,

    sameEmail,

    samePhone,

    invoiceId,

    feeMonth,
  };
}

/**
 * Email + WhatsApp delivery.
 *
 * This function runs AFTER the admin request has
 * already returned successfully.
 */
async function deliverPaymentLink(
  prepared: Awaited<
    ReturnType<
      typeof preparePaymentLink
    >
  >,
  actor: string
) {
  const {
    paymentUrl,
    groupId,
    studentIds,
    total,
    currency,
    names,
    sameEmail,
    samePhone,
    invoiceId,
    feeMonth,
  } = prepared;

  /*
   * EMAIL
   */
  const emailResult: any = {
    attempted: false,
    ok: false,
    status: "SKIPPED",
    error: null,
  };

  if (sameEmail) {
    emailResult.attempted =
      true;

    try {
      await sendEmail({
        to: sameEmail,

        subject:
          `Monthly fee payment — ${names.join(
            " & "
          )} — ${monthLabel(
            feeMonth
          )}`,

        html: feeEmail({
          studentNames:
            names,

          month:
            monthLabel(
              feeMonth
            ),

          amount:
            total,

          currency,

          payUrl:
            paymentUrl,
        }),
      });

      emailResult.ok =
        true;

      emailResult.status =
        "SENT";

      try {
        await supabaseAdmin
          .from("message_log")
          .insert({
            student_id:
              studentIds.length ===
              1
                ? studentIds[0]
                : null,

            payment_group_id:
              groupId,

            channel:
              "EMAIL",

            destination:
              sameEmail,

            status:
              "SENT",
          });
      } catch (logError) {
        console.error(
          "Email message log failed:",
          logError
        );
      }
    } catch (error: any) {
      emailResult.status =
        "FAILED";

      emailResult.error =
        error?.message ||
        "Email sending failed";

      try {
        await supabaseAdmin
          .from("message_log")
          .insert({
            student_id:
              studentIds.length ===
              1
                ? studentIds[0]
                : null,

            payment_group_id:
              groupId,

            channel:
              "EMAIL",

            destination:
              sameEmail,

            status:
              "FAILED",
          });
      } catch (logError) {
        console.error(
          "Failed email log:",
          logError
        );
      }
    }
  }

  /*
   * WHATSAPP
   */
  let whatsappResult: any = {
    attempted: false,
    ok: false,
    status: "SKIPPED",
    error: null,
  };

  if (samePhone) {
    whatsappResult.attempted =
      true;

    try {
      const result =
        await sendWhatsAppPaymentLink({
          to: samePhone,

          studentNames:
            names,

          total,

          currency,

          feeMonth:
            monthLabel(
              feeMonth
            ),

          paymentUrl,

          logStudentId:
            studentIds.length ===
            1
              ? studentIds[0]
              : null,

          paymentGroupId:
            groupId,
        });

      whatsappResult = {
        ...whatsappResult,

        ...result,

        attempted:
          true,

        ok:
          Boolean(
            result?.ok
          ),

        status:
          result?.ok
            ? "SENT"
            : "FAILED",

        error:
          result?.reason ||
          null,
      };
    } catch (error: any) {
      whatsappResult.status =
        "FAILED";

      whatsappResult.error =
        error?.message ||
        "WhatsApp sending failed";
    }
  }

  /*
   * AUDIT
   */
  try {
    await logAudit(
      "PAYMENT_LINK_SEND_ATTEMPT",

      groupId
        ? "payment_group"
        : "invoice",

      invoiceId,

      actor,

      {
        studentIds,

        paymentUrl,

        email:
          emailResult,

        whatsapp:
          whatsappResult,
      }
    );
  } catch (auditError) {
    console.error(
      "Payment link audit failed:",
      auditError
    );
  }

  return {
    email:
      emailResult,

    whatsapp:
      whatsappResult,
  };
}

/**
 * SEND PAYMENT LINK
 */
export async function POST(
  req: Request
) {
  const session =
    await getAdminSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const body =
      await req.json();

    if (!body.studentId) {
      return NextResponse.json(
        {
          error:
            "Student ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const feeMonth =
      monthStart(
        body.month
      );

    /*
     * Find student.
     */
    const {
      data: student,
      error: studentError,
    } =
      await supabaseAdmin
        .from("students")
        .select("*")
        .eq(
          "id",
          body.studentId
        )
        .single();

    if (
      studentError ||
      !student
    ) {
      return NextResponse.json(
        {
          error:
            "Student not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Check for other children belonging
     * to the same parent.
     */
    const matches =
      await matchingStudents(
        student
      );

    /*
     * Ask admin whether to merge.
     */
    if (
      !body.forceSeparate &&
      !body.mergeConfirmed &&
      matches.length
    ) {
      return NextResponse.json({
        needsMergeDecision:
          true,

        student: {
          id:
            student.id,

          name:
            student.student_name,

          email:
            student.parent_email,

          phone:
            student.whatsapp_phone ||
            student.parent_phone,
        },

        matches:
          matches.map(
            (item: any) => ({
              id:
                item.id,

              name:
                item.student_name,

              age:
                item.age,

              country:
                item.country,

              currency:
                item.currency,

              fee:
                item.monthly_fee,

              email:
                item.parent_email,

              phone:
                item.whatsapp_phone ||
                item.parent_phone,
            })
          ),
      });
    }

    /*
     * Default = one student.
     */
    let selected =
      [student];

    /*
     * MERGED PAYMENT.
     */
    if (
      body.mergeConfirmed
    ) {
      const ids =
        Array.from(
          new Set([
            student.id,

            ...(Array.isArray(
              body.studentIds
            )
              ? body.studentIds
              : []),
          ])
        );

      const {
        data: rows,
        error: rowsError,
      } =
        await supabaseAdmin
          .from("students")
          .select("*")
          .in(
            "id",
            ids
          );

      if (rowsError) {
        throw rowsError;
      }

      selected =
        rows || [];

      if (!selected.length) {
        throw new Error(
          "No students found for merged payment"
        );
      }
    }

    const actor =
      String(
        session.email ||
        "admin"
      );

    /*
     * IMPORTANT:
     *
     * Only prepare the payment link here.
     * Do NOT wait for email/WhatsApp.
     */
    const prepared =
      await preparePaymentLink(
        selected,
        feeMonth,
        actor
      );

    /*
     * Start email/WhatsApp delivery after
     * the response is ready.
     */
    after(async () => {
      try {
        await deliverPaymentLink(
          prepared,
          actor
        );
      } catch (error) {
        console.error(
          "Background payment-link delivery failed:",
          error
        );
      }
    });

    /*
     * RETURN IMMEDIATELY.
     */
    return NextResponse.json({
      ok: true,

      paymentUrl:
        prepared.paymentUrl,

      groupId:
        prepared.groupId,

      studentIds:
        prepared.studentIds,

      total:
        prepared.total,

      currency:
        prepared.currency,

      email: {
        queued:
          Boolean(
            prepared.sameEmail
          ),

        status:
          prepared.sameEmail
            ? "QUEUED"
            : "SKIPPED",
      },

      whatsapp: {
        queued:
          Boolean(
            prepared.samePhone
          ),

        status:
          prepared.samePhone
            ? "QUEUED"
            : "SKIPPED",
      },

      emailSent:
        false,

      whatsappSent:
        false,
    });
  } catch (error: any) {
    console.error(
      "Payment link request failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error?.message ||
          "Could not send payment link",
      },
      {
        status: 400,
      }
    );
  }
}
