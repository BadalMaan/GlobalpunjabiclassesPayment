import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { monthStart } from "@/lib/fees";

const ALLOWED_FIELDS = [
  "serial_number",
  "student_name",
  "age",
  "country",
  "timing",
  "days",
  "monthly_fee",
  "parent_name",
  "parent_email",
  "parent_phone",
  "whatsapp_phone",
  "gender",
  "teacher_name",
  "groups",
  "currency",
  "active",
] as const;

function cleanStudentPayload(body: any) {
  const payload: Record<string, any> = {};

  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  }

  if ("age" in payload) {
    payload.age =
      payload.age === "" ||
      payload.age === undefined
        ? null
        : Number(payload.age);
  }

  if ("monthly_fee" in payload) {
    payload.monthly_fee = Number(
      payload.monthly_fee
    );
  }

  if ("groups" in payload) {
    payload.groups = Array.isArray(
      payload.groups
    )
      ? payload.groups
      : [];
  }

  if ("active" in payload) {
    payload.active = Boolean(payload.active);
  }

  return payload;
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
      { error: "Student ID is required" },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const payload = cleanStudentPayload(body);

    if (
      !String(payload.student_name || "").trim() ||
      !String(payload.serial_number || "").trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Student number and student name are required.",
        },
        { status: 400 }
      );
    }

    if (
      payload.monthly_fee === undefined ||
      Number.isNaN(payload.monthly_fee) ||
      payload.monthly_fee < 0
    ) {
      return NextResponse.json(
        { error: "A valid monthly fee is required." },
        { status: 400 }
      );
    }

    // Keep the previous student row so we can restore it if the invoice
    // synchronization fails after the student update succeeds.
    const { data: previousStudent, error: previousStudentError } =
      await supabaseAdmin
        .from("students")
        .select("*")
        .eq("id", id)
        .single();

    if (previousStudentError || !previousStudent) {
      console.error(
        "Student lookup before update error:",
        previousStudentError
      );

      return NextResponse.json(
        {
          error:
            previousStudentError?.message ||
            "Could not find student.",
        },
        { status: 400 }
      );
    }

    const { data: student, error } = await supabaseAdmin
      .from("students")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Student update error:", error);

      return NextResponse.json(
        {
          error:
            error.message ||
            "Could not update student.",
        },
        { status: 400 }
      );
    }

    let invoice = null;
    let updatedInvoiceId: string | null = null;

    try {
      /*
       * Keep the current month's NORMAL monthly invoice synchronized with
       * the student's monthly fee/currency while it is still PENDING.
       *
       * Custom invoices are deliberately ignored. PAID/PROCESSING/VERIFYING
       * invoices are also never changed.
       */
      const currentMonth = monthStart();

      const { data: pendingInvoices, error: pendingInvoiceReadError } =
        await supabaseAdmin
          .from("fee_invoices")
          .select("*")
          .eq("student_id", id)
          .eq("fee_month", currentMonth)
          .eq("status", "PENDING");

      if (pendingInvoiceReadError) {
        throw pendingInvoiceReadError;
      }

      const normalInvoice = (pendingInvoices || []).find(
        (item: any) =>
          String(item.invoice_number || "").startsWith(
            "GPC-CUSTOM-"
          ) === false
      );

      if (normalInvoice) {
        const { data: updatedInvoice, error: invoiceUpdateError } =
          await supabaseAdmin
            .from("fee_invoices")
            .update({
              amount: Number(student.monthly_fee),
              currency: String(
                student.currency || ""
              ).toUpperCase(),
            })
            .eq("id", normalInvoice.id)
            .eq("status", "PENDING")
            .select("*")
            .single();

        if (invoiceUpdateError || !updatedInvoice) {
          throw (
            invoiceUpdateError ||
            new Error("Could not update the current month's fee invoice.")
          );
        }

        invoice = updatedInvoice;
        updatedInvoiceId = updatedInvoice.id;
      }
    } catch (invoiceError: any) {
      // Best-effort rollback: the student and its normal pending invoice
      // should not be left showing different fee/currency values.
      try {
        await supabaseAdmin
          .from("students")
          .update(previousStudent)
          .eq("id", id);
      } catch (rollbackError) {
        console.error(
          "Student rollback error:",
          rollbackError
        );
      }

      if (updatedInvoiceId) {
        try {
          await supabaseAdmin
            .from("fee_invoices")
            .update({
              amount: previousStudent.monthly_fee,
              currency: previousStudent.currency,
            })
            .eq("id", updatedInvoiceId);
        } catch (invoiceRollbackError) {
          console.error(
            "Invoice rollback error:",
            invoiceRollbackError
          );
        }
      }

      console.error(
        "Current month invoice sync error:",
        invoiceError
      );

      return NextResponse.json(
        {
          error:
            invoiceError?.message ||
            "Could not sync the current month's fee invoice.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      student,
      invoice,
    });
  } catch (error: any) {
    console.error(
      "Student update request error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not update student.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
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
      { error: "Student ID is required" },
      { status: 400 }
    );
  }

  try {
    // Remove dependent records first so a student's
    // invoices/message records do not block deletion.
    const { data: invoices, error: invoiceReadError } =
      await supabaseAdmin
        .from("fee_invoices")
        .select("id")
        .eq("student_id", id);

    if (invoiceReadError) {
      throw invoiceReadError;
    }

    const invoiceIds =
      (invoices || []).map(
        (invoice: any) => invoice.id
      );

    if (invoiceIds.length) {
      const {
        error: groupItemError,
      } = await supabaseAdmin
        .from("payment_group_items")
        .delete()
        .in("invoice_id", invoiceIds);

      if (groupItemError) {
        throw groupItemError;
      }
    }

    const {
      error: messageError,
    } = await supabaseAdmin
      .from("message_log")
      .delete()
      .eq("student_id", id);

    if (messageError) {
      throw messageError;
    }

    const {
      error: invoiceDeleteError,
    } = await supabaseAdmin
      .from("fee_invoices")
      .delete()
      .eq("student_id", id);

    if (invoiceDeleteError) {
      throw invoiceDeleteError;
    }

    const {
      data: deletedStudent,
      error: studentDeleteError,
    } = await supabaseAdmin
      .from("students")
      .delete()
      .eq("id", id)
      .select("id")
      .single();

    if (studentDeleteError) {
      throw studentDeleteError;
    }

    return NextResponse.json({
      ok: true,
      deletedStudentId:
        deletedStudent?.id || id,
    });
  } catch (error: any) {
    console.error(
      "Student deletion error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not delete student.",
      },
      { status: 400 }
    );
  }
}
