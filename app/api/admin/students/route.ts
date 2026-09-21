import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_CURRENCIES = [
  "USD",
  "AUD",
  "CAD",
  "NZD",
  "GBP",
  "EUR",
  "INR",
];

const ALLOWED_GROUPS = [
  "Speaking Group",
  "Writing Group",
  "Reading Group",
];

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const valueTrimmed = value.trim();

  return valueTrimmed || null;
}

function cleanGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string"
        )
        .map((item) => item.trim())
        .filter((item) =>
          ALLOWED_GROUPS.includes(item)
        )
    )
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

    const serialNumber = Number(
      body.serial_number
    );

    const studentName = cleanText(
      body.student_name
    );

    const country = cleanText(
      body.country
    );

    const currency = String(
      body.currency || "USD"
    )
      .trim()
      .toUpperCase();

    const monthlyFee = Number(
      body.monthly_fee
    );

    if (
      !Number.isInteger(serialNumber) ||
      serialNumber <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Student Number must be a positive whole number.",
        },
        {
          status: 400,
        }
      );
    }

    if (!studentName) {
      return NextResponse.json(
        {
          error:
            "Student Name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!country) {
      return NextResponse.json(
        {
          error: "Country is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_CURRENCIES.includes(
        currency
      )
    ) {
      return NextResponse.json(
        {
          error: "Invalid currency.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(monthlyFee) ||
      monthlyFee < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Monthly Fee must be a valid number.",
        },
        {
          status: 400,
        }
      );
    }

    const age =
      body.age === "" ||
      body.age === null ||
      body.age === undefined
        ? null
        : Number(body.age);

    if (
      age !== null &&
      (!Number.isInteger(age) ||
        age < 0 ||
        age > 120)
    ) {
      return NextResponse.json(
        {
          error:
            "Age must be a valid whole number.",
        },
        {
          status: 400,
        }
      );
    }

    const student = {
      serial_number: serialNumber,

      student_name: studentName,

      age,

      country,

      timing: cleanText(
        body.timing
      ),

      days: cleanText(
        body.days
      ),

      monthly_fee: monthlyFee,

      currency,

      parent_name: cleanText(
        body.parent_name
      ),

      parent_email: cleanText(
        body.parent_email
      ),

      parent_phone: cleanText(
        body.parent_phone
      ),

      whatsapp_phone: cleanText(
        body.whatsapp_phone
      ),

      gender: cleanText(
        body.gender
      ),

      teacher_name: cleanText(
        body.teacher_name
      ),

      groups: cleanGroups(
        body.groups
      ),

      active:
        body.active !== false,
    };

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("students")
      .select(
        "id, student_name, serial_number"
      )
      .eq(
        "serial_number",
        serialNumber
      )
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.message,
        },
        {
          status: 400,
        }
      );
    }

    if (existing) {
      return NextResponse.json(
        {
          error: `Student Number ${serialNumber} is already used by ${existing.student_name}.`,
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: createdStudent,
      error,
    } = await supabaseAdmin
      .from("students")
      .insert(student)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        student: createdStudent,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create student.",
      },
      {
        status: 400,
      }
    );
  }
}
