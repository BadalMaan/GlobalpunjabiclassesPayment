import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import Papa from "papaparse";
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

function groupsFromRow(
  r: Record<string, string>
) {
  const raw =
    r["GROUPS"] ||
    r["groups"] ||
    "";

  return Array.from(
    new Set(
      raw
        .split(/[,|;]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) =>
          x
            .replace(/\b\w/g, (c) =>
              c.toUpperCase()
            )
        )
        .filter((x) =>
          ALLOWED_GROUPS.includes(x)
        )
    )
  );
}

function cleanText(
  value: unknown
) {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

export async function POST(
  req: Request
) {
  const session =
    await getAdminSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    const body =
      await req.json();

    const { csv } = body;

    if (
      !csv ||
      typeof csv !== "string"
    ) {
      return NextResponse.json(
        {
          error: "CSV required",
        },
        { status: 400 }
      );
    }

    const parsed =
      Papa.parse<
        Record<string, string>
      >(csv, {
        header: true,
        skipEmptyLines: true,
      });

    if (
      parsed.errors &&
      parsed.errors.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            "CSV could not be read correctly.",
          details:
            parsed.errors,
        },
        { status: 400 }
      );
    }

    const rows =
      parsed.data
        .map((r) => {
          const serialNumber =
            Number(
              r["S.NUMBER"] ||
                r["serial_number"]
            );

          const studentName =
            cleanText(
              r["STUDENT NAME"] ||
                r["student_name"]
            );

          const country =
            cleanText(
              r["COUNTRY NAME"] ||
                r["country"]
            );

          const age =
            r["AGE"] ||
            r["age"]
              ? Number(
                  r["AGE"] ||
                    r["age"]
                )
              : null;

          const monthlyFee =
            Number(
              String(
                r["FEE"] ||
                  r["monthly_fee"] ||
                  ""
              ).replace(
                /[^0-9.]/g,
                ""
              )
            );

          const currency =
            (
              r["CURRENCY"] ||
              r["currency"] ||
              "USD"
            )
              .trim()
              .toUpperCase();

          return {
            serial_number:
              serialNumber,

            student_name:
              studentName,

            age,

            country,

            timing:
              cleanText(
                r[
                  "TIMING AS PER COUNTRY"
                ] ||
                  r["timing"]
              ),

            days:
              cleanText(
                r["DAYS"] ||
                  r["days"]
              ),

            monthly_fee:
              monthlyFee,

            currency,

            parent_name:
              cleanText(
                r["PARENTS NAME"] ||
                  r["parent_name"]
              ),

            parent_email:
              cleanText(
                r["PARENT EMAIL"] ||
                  r["parent_email"]
              ),

            parent_phone:
              cleanText(
                r["PARENT PHONE"] ||
                  r["parent_phone"] ||
                  r["MOBILE"]
              ),

            whatsapp_phone:
              cleanText(
                r["WHATSAPP"] ||
                  r["whatsapp_phone"] ||
                  r["MOBILE"] ||
                  r["PARENT PHONE"]
              ),

            gender:
              cleanText(
                r["GENDER"] ||
                  r["gender"]
              ),

            teacher_name:
              cleanText(
                r["TEACHER"] ||
                  r["TEACHER NAME"] ||
                  r["teacher_name"]
              ),

            groups:
              groupsFromRow(r),

            active: true,
          };
        })
        .filter((row) => {
          return (
            Number.isInteger(
              row.serial_number
            ) &&
            row.serial_number > 0 &&
            Boolean(
              row.student_name
            ) &&
            Boolean(row.country) &&
            Number.isFinite(
              row.monthly_fee
            ) &&
            row.monthly_fee >= 0 &&
            ALLOWED_CURRENCIES.includes(
              row.currency
            )
          );
        });

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid student rows were found in the CSV.",
        },
        { status: 400 }
      );
    }

    const {
      error,
    } =
      await supabaseAdmin
        .from("students")
        .upsert(
          rows,
          {
            onConflict:
              "serial_number",
          }
        );

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import students.",
      },
      { status: 400 }
    );
  }
}
