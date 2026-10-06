import { supabaseAdmin } from "@/lib/supabase";
import { monthLabel } from "@/lib/fees";
import { config } from "@/lib/config";
import PaymentClient from "@/components/PaymentClient";

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const {
    data: invoice,
  } = await supabaseAdmin
    .from("fee_invoices")
    .select("*,students(*)")
    .eq("secure_token", token)
    .single();

  if (!invoice) {
    return (
      <main
        className="container"
        style={{ padding: "80px 20px" }}
      >
        <div className="card payCard">
          <h1>
            Payment link unavailable
          </h1>

          <p>
            This fee link is invalid or unavailable.
          </p>
        </div>
      </main>
    );
  }

  /*
   * IMPORTANT:
   *
   * Supabase numeric values can arrive as strings.
   * Convert the invoice amount to a real number
   * before passing it to PaymentClient.
   */
  const paymentAmount =
    Number(invoice.amount);

  /*
   * Never allow an invalid amount to reach the
   * client-side payment calculation.
   */
  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    return (
      <main
        className="container"
        style={{ padding: "80px 20px" }}
      >
        <div className="card payCard">
          <h1>
            Payment link unavailable
          </h1>

          <p>
            The payment amount for this invoice
            is invalid. Please contact Global
            Punjabi Classes.
          </p>
        </div>
      </main>
    );
  }

  const student = invoice.students;

  /*
   * Supabase normally returns the related student
   * as an object for this single relationship.
   */
  const studentName =
    Array.isArray(student)
      ? student[0]?.student_name
      : student?.student_name;

  if (!studentName) {
    return (
      <main
        className="container"
        style={{ padding: "80px 20px" }}
      >
        <div className="card payCard">
          <h1>
            Payment link unavailable
          </h1>

          <p>
            Student information could not be
            loaded. Please contact Global Punjabi
            Classes.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="container brand">
          <div className="brandMark">
            GPC
          </div>

          <span>
            Global Punjabi Classes
          </span>
        </div>
      </header>

      <main
        className="container"
        style={{
          padding:
            "40px 20px 80px",
        }}
      >
        <PaymentClient
          invoice={{
            id: invoice.id,
            token,
            studentNames: [
              studentName,
            ],
            month: monthLabel(
              invoice.fee_month
            ),
            amount: paymentAmount,
            currency: invoice.currency,
            status: invoice.status,
            type: "invoice",
          }}
          config={config}
        />
      </main>
    </>
  );
}
