import { NextResponse } from "next/server";
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

async function matchingStudents(student: any) {
  const email = normalizeEmail(student.parent_email);
  const phone = normalizePhone(
    student.whatsapp_phone || student.parent_phone
  );

  if (!email && !phone) return [];

  const { data: all } = await supabaseAdmin
    .from("students")
    .select("*")
    .eq("active", true)
    .order("serial_number");

  return (all || []).filter((s: any) => {
    const sameEmail =
      email &&
      normalizeEmail(s.parent_email) === email;

    const samePhone =
      phone &&
      normalizePhone(
        s.whatsapp_phone || s.parent_phone
      ) === phone;

    return (
      (sameEmail || samePhone) &&
      s.id !== student.id
    );
  });
}

async function sendForStudents(
  students: any[],
  feeMonth: string,
  actor: string
) {
  if (!students.length) {
    throw new Error("No students selected");
  }

  const currencies = new Set(
    students.map((s) =>
      String(s.currency).toUpperCase()
    )
  );

  if (currencies.size !== 1) {
    throw new Error(
      "Students with different currencies cannot be merged into one payment link"
    );
  }

  const prepared = [];

  for (const student of students) {
    prepared.push(
      await ensureInvoice(
        student.id,
        feeMonth
      )
    );
  }

  const currency =
    prepared[0].invoice.currency;

  const total = prepared
    .reduce(
      (sum, item) =>
        sum +
        Number(item.invoice.amount),
      0
    )
    .toFixed(2);

  const sameEmail =
    students
      .map((s) =>
        normalizeEmail(s.parent_email)
      )
      .find(Boolean) || "";

  const samePhone =
    students
      .map((s) =>
        normalizePhone(
          s.whatsapp_phone ||
            s.parent_phone
        )
      )
      .find(Boolean) || "";

  const names = students.map(
    (s) => s.student_name
  );

  let paymentUrl = "";
  let groupId: string | null = null;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not configured"
    );
  }

  if (prepared.length === 1) {
    paymentUrl =
      `${siteUrl}/pay/${prepared[0].invoice.secure_token}`;
  } else {
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
        fee_month: feeMonth,
        amount: Number(total),
        currency,
        invoice_number:
          invoiceNumber,
      })
      .select("*")
      .single();

    if (groupError || !group) {
      throw (
        groupError ||
        new Error(
          "Could not create payment group"
        )
      );
    }

    groupId = group.id;

    const items = prepared.map(
      (item) => ({
        payment_group_id: group.id,
        invoice_id: item.invoice.id,
        amount: item.invoice.amount,
      })
    );

    const {
      error: itemError,
    } = await supabaseAdmin
      .from("payment_group_items")
      .insert(items);

    if (itemError) {
      throw itemError;
    }

    paymentUrl =
      `${siteUrl}/pay/group/${group.secure_token}`;

    await logAudit(
      "PAYMENT_LINK_MERGED",
      "payment_group",
      group.id,
      actor,
      {
        studentIds: students.map(
          (s) => s.id
        ),
        total,
        currency,
      }
    );
  }

  if (!sameEmail && !samePhone) {
    throw new Error(
      "No parent email or WhatsApp number is available"
    );
  }

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
    emailResult.attempted = true;

    try {
      await sendEmail({
        to: sameEmail,
        subject:
          `Monthly fee payment — ${names.join(
            " & "
          )} — ${monthLabel(feeMonth)}`,
        html: feeEmail({
          studentNames: names,
          month: monthLabel(feeMonth),
          amount: total,
          currency,
          payUrl: paymentUrl,
        }),
      });

      emailResult.ok = true;
      emailResult.status = "SENT";

      await supabaseAdmin
        .from("message_log")
        .insert({
          student_id:
            students.length === 1
              ? students[0].id
              : null,
          payment_group_id:
            groupId,
          channel: "EMAIL",
          destination: sameEmail,
          status: "SENT",
        });
    } catch (error: any) {
      emailResult.status = "FAILED";
      emailResult.error =
        error?.message ||
        "Email sending failed";

      await supabaseAdmin
        .from("message_log")
        .insert({
          student_id:
            students.length === 1
              ? students[0].id
              : null,
          payment_group_id:
            groupId,
          channel: "EMAIL",
          destination: sameEmail,
          status: "FAILED",
        })
        .catch(() => {});
    }
  }

  /*
   * WHATSAPP
   */

  const whatsappResult: any = {
    attempted: false,
    ok: false,
    status: "SKIPPED",
    error: null,
  };

  if (samePhone) {
    whatsappResult.attempted = true;

    try {
      const result =
        await sendWhatsAppPaymentLink({
          to: samePhone,
          studentNames: names,
          total,
          currency,
          feeMonth:
            monthLabel(feeMonth),
          paymentUrl,
          logStudentId:
            students.length === 1
              ? students[0].id
              : null,
          paymentGroupId:
            groupId,
        });

      whatsappResult = {
        ...whatsappResult,
        ...result,
        attempted: true,
        ok: Boolean(
          result?.ok
        ),
        status:
          result?.ok
            ? "SENT"
            : "FAILED",
        error:
          result?.error ||
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

  await logAudit(
    "PAYMENT_LINK_SEND_ATTEMPT",
    groupId
      ? "payment_group"
      : "invoice",
    groupId ||
      prepared[0].invoice.id,
    actor,
    {
      studentIds: students.map(
        (s) => s.id
      ),
      paymentUrl,
      email: emailResult,
      whatsapp: whatsappResult,
    }
  );

  return {
    paymentUrl,
    groupId,
    studentIds: students.map(
      (s) => s.id
    ),
    total,
    currency,

    email: emailResult,
    whatsapp: whatsappResult,

    emailSent:
      emailResult.status ===
      "SENT",

    whatsappSent:
      whatsappResult.status ===
      "SENT",
  };
}

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
      { status: 401 }
    );
  }

  try {
    const body =
      await req.json();

    const feeMonth =
      monthStart(body.month);

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

    if (studentError || !student) {
      return NextResponse.json(
        {
          error:
            "Student not found",
        },
        { status: 404 }
      );
    }

    const matches =
      await matchingStudents(
        student
      );

    if (
      !body.forceSeparate &&
      !body.mergeConfirmed &&
      matches.length
    ) {
      return NextResponse.json({
        needsMergeDecision: true,

        student: {
          id: student.id,
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
            (s: any) => ({
              id: s.id,
              name:
                s.student_name,
              age: s.age,
              country:
                s.country,
              currency:
                s.currency,
              fee:
                s.monthly_fee,
              email:
                s.parent_email,
              phone:
                s.whatsapp_phone ||
                s.parent_phone,
            })
          ),
      });
    }

    let selected = [
      student,
    ];

    if (body.mergeConfirmed) {
      const ids = Array.from(
        new Set([
          student.id,
          ...(
            Array.isArray(
              body.studentIds
            )
              ? body.studentIds
              : []
          ),
        ])
      );

      const {
        data: rows,
      } =
        await supabaseAdmin
          .from("students")
          .select("*")
          .in(
            "id",
            ids
          );

      selected =
        rows || [];
    }

    const result =
      await sendForStudents(
        selected,
        feeMonth,
        String(
          session.email ||
            "admin"
        )
      );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Could not send payment link",
      },
      { status: 400 }
    );
  }
}
