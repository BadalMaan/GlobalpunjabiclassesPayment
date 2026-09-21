"use client";

import { useMemo, useState } from "react";

type AnyRecord = Record<string, any>;

type AdminClientProps = {
  initialStudents: AnyRecord[];
  initialInvoices: AnyRecord[];
  month: string;
};

const CURRENCIES = ["USD", "AUD", "CAD", "NZD", "GBP", "EUR", "INR"];

const COUNTRIES = [
  "USA",
  "Australia",
  "Canada",
  "New Zealand",
  "UK",
  "Europe",
  "India",
];

const GROUPS = [
  "Speaking Group",
  "Writing Group",
  "Reading Group",
];

function statusLabel(status: string) {
  if (status === "PAID") return "RECEIVED";

  if (
    status === "PROCESSING" ||
    status === "VERIFYING"
  ) {
    return "IN PROGRESS";
  }

  return status || "PENDING";
}

function statusClass(status: string) {
  if (status === "PAID") {
    return "statusReceived";
  }

  if (
    status === "PROCESSING" ||
    status === "VERIFYING"
  ) {
    return "statusProgress";
  }

  if (
    status === "FAILED" ||
    status === "REFUNDED"
  ) {
    return "statusFailed";
  }

  return "statusPending";
}

function formatMethod(
  method: string | null | undefined
) {
  if (!method) return "";

  return method.replace(/_/g, " ");
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function AdminClient({
  initialStudents,
  initialInvoices,
  month,
}: AdminClientProps) {
  const [students, setStudents] = useState<AnyRecord[]>(
    initialStudents || []
  );

  const [invoices, setInvoices] = useState<
    AnyRecord[]
  >(initialInvoices || []);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("ALL");
  const [currency, setCurrency] = useState("ALL");
  const [paymentStatus, setPaymentStatus] =
    useState("ALL");
  const [teacher, setTeacher] = useState("ALL");
  const [group, setGroup] = useState("ALL");
  const [gender, setGender] = useState("ALL");

  const [merge, setMerge] =
    useState<AnyRecord | null>(null);

  const [processView, setProcessView] =
    useState<AnyRecord | null>(null);

  const [sending, setSending] =
    useState<string | null>(null);

  const [toast, setToast] = useState("");

  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);

  const [studentForm, setStudentForm] = useState({
    serial_number: "",
    student_name: "",
    age: "",
    country: "USA",
    timing: "",
    days: "",
    monthly_fee: "",
    parent_name: "",
    parent_email: "",
    parent_phone: "",
    whatsapp_phone: "",
    gender: "",
    teacher_name: "",
    groups: [] as string[],
    currency: "USD",
    active: true,
  });

  function updateStudentForm(field: string, value: any) {
    setStudentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleStudentGroup(groupName: string) {
    setStudentForm((current) => ({
      ...current,
      groups: current.groups.includes(groupName)
        ? current.groups.filter((item) => item !== groupName)
        : [...current.groups, groupName],
    }));
  }

  async function addStudent(keepOpen = false) {
    if (
      !studentForm.serial_number.trim() ||
      !studentForm.student_name.trim() ||
      !studentForm.country ||
      !studentForm.currency ||
      !studentForm.monthly_fee
    ) {
      showToast(
        "Please fill Student Number, Student Name, Country, Currency and Fee."
      );
      return;
    }

    setAddingStudent(true);

    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...studentForm,
          age: studentForm.age ? Number(studentForm.age) : null,
          monthly_fee: Number(studentForm.monthly_fee),
          groups: studentForm.groups,
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        showToast(data.error || "Could not add student.");
        return;
      }

      if (data.student) {
        setStudents((current) => [data.student, ...current]);
      }

      setStudentForm({
        serial_number: "",
        student_name: "",
        age: "",
        country: "USA",
        timing: "",
        days: "",
        monthly_fee: "",
        parent_name: "",
        parent_email: "",
        parent_phone: "",
        whatsapp_phone: "",
        gender: "",
        teacher_name: "",
        groups: [],
        currency: "USD",
        active: true,
      });

      if (!keepOpen) {
        setAddStudentOpen(false);
      }

      showToast(
        keepOpen
          ? "Student added. Ready for the next student."
          : "Student added successfully."
      );
    } catch {
      showToast("Could not connect to the student service.");
    } finally {
      setAddingStudent(false);
    }
  }

  const teachers = useMemo(() => {
    return Array.from(
      new Set(
        students
          .map(
            (student) => student.teacher_name
          )
          .filter(Boolean)
      )
    ).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    return students.filter((student) => {
      const searchable = [
        student.student_name,
        student.age,
        student.days,
        student.teacher_name,
        student.country,
        student.parent_name,
        student.parent_email,
        student.parent_phone,
        student.whatsapp_phone,
        student.gender,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const groups = Array.isArray(
        student.groups
      )
        ? student.groups
        : [];

      return (
        (!normalizedQuery ||
          searchable.includes(
            normalizedQuery
          )) &&
        (country === "ALL" ||
          student.country === country) &&
        (currency === "ALL" ||
          student.currency === currency) &&
        (teacher === "ALL" ||
          student.teacher_name === teacher) &&
        (gender === "ALL" ||
          student.gender === gender) &&
        (group === "ALL" ||
          groups.some(
            (item: string) =>
              item.toLowerCase() ===
              group.toLowerCase()
          ))
      );
    });
  }, [
    students,
    query,
    country,
    currency,
    teacher,
    gender,
    group,
  ]);

  const invoiceMap = useMemo(() => {
    return new Map(
      invoices.map((invoice) => [
        invoice.student_id,
        invoice,
      ])
    );
  }, [invoices]);

  const visibleRows = useMemo(() => {
    return filteredStudents
      .map((student) => ({
        student,
        invoice: invoiceMap.get(student.id),
      }))
      .filter(({ invoice }) => {
        return (
          paymentStatus === "ALL" ||
          invoice?.status === paymentStatus
        );
      });
  }, [
    filteredStudents,
    invoiceMap,
    paymentStatus,
  ]);

  const counts = useMemo(() => {
    return {
      total: students.length,

      active: students.filter(
        (student) => student.active
      ).length,

      inactive: students.filter(
        (student) => !student.active
      ).length,

      received: invoices.filter(
        (invoice) =>
          invoice.status === "PAID"
      ).length,

      pending: invoices.filter(
        (invoice) =>
          invoice.status === "PENDING"
      ).length,

      progress: invoices.filter(
        (invoice) =>
          invoice.status === "PROCESSING" ||
          invoice.status === "VERIFYING"
      ).length,
    };
  }, [students, invoices]);

  const teacherStats = useMemo(() => {
    return teachers.map((teacherName) => {
      const teacherStudents =
        students.filter(
          (student) =>
            student.teacher_name ===
            teacherName
        );

      return {
        name: teacherName,
        count: teacherStudents.length,
        students:
          teacherStudents.map(
            (student) =>
              student.student_name
          ),
      };
    });
  }, [students, teachers]);

  const currencyStats = useMemo(() => {
    return CURRENCIES.map((item) => {
      const currencyStudents =
        students.filter(
          (student) =>
            student.currency === item
        );

      return {
        currency: item,
        count: currencyStudents.length,

        total: currencyStudents.reduce(
          (total, student) =>
            total +
            Number(
              student.monthly_fee || 0
            ),
          0
        ),
      };
    });
  }, [students]);

  function showToast(message: string) {
    setToast(message);

    window.setTimeout(
      () => setToast(""),
      4500
    );
  }

  function getSendResultMessage(data: AnyRecord) {
    const emailStatus =
      data?.email?.status ||
      (data?.email?.queued
        ? "QUEUED"
        : data?.emailSent
          ? "SENT"
          : "SKIPPED");

    const whatsappStatus =
      data?.whatsapp?.status ||
      (data?.whatsapp?.queued
        ? "QUEUED"
        : data?.whatsappSent
          ? "SENT"
          : "SKIPPED");

    const emailText =
      emailStatus === "SENT"
        ? "Email sent"
        : emailStatus === "QUEUED"
          ? "Email queued"
          : emailStatus === "FAILED"
            ? "Email failed"
            : "Email skipped";

    const whatsappText =
      whatsappStatus === "SENT"
        ? "WhatsApp sent"
        : whatsappStatus === "QUEUED"
          ? "WhatsApp queued"
          : whatsappStatus === "FAILED"
            ? "WhatsApp failed"
            : "WhatsApp skipped";

    if (
      emailStatus === "SENT" &&
      whatsappStatus === "SENT"
    ) {
      return "Payment link sent successfully by Email and WhatsApp.";
    }

    if (
      emailStatus === "QUEUED" &&
      whatsappStatus === "QUEUED"
    ) {
      return "Payment link created successfully. Email and WhatsApp delivery queued.";
    }

    if (
      emailStatus === "QUEUED" ||
      whatsappStatus === "QUEUED"
    ) {
      return `${emailText} · ${whatsappText}. Payment link created successfully.`;
    }

    if (
      emailStatus === "SENT" ||
      whatsappStatus === "SENT"
    ) {
      return `${emailText} · ${whatsappText}.`;
    }

    return `${emailText} · ${whatsappText}. Please check the Email/WhatsApp configuration.`;
  }

  async function sendLinkSeparate(
    studentId: string
  ) {
    setSending(studentId);

    try {
      const response = await fetch(
        "/api/admin/payment-links/send",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            studentId,
            month,
            forceSeparate: true,
          }),
        }
      );

      const data =
        await readJson(response);

      if (response.ok) {
        showToast(getSendResultMessage(data));
      } else {
        showToast(
          data.error ||
            "Could not send payment link."
        );
      }
    } catch {
      showToast(
        "Could not connect to the payment-link service."
      );
    } finally {
      setSending(null);
    }
  }

  async function sendLink(
    studentId: string
  ) {
    setSending(studentId);

    try {
      const response = await fetch(
        "/api/admin/payment-links/send",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            studentId,
            month,
          }),
        }
      );

      const data =
        await readJson(response);

      if (data.needsMergeDecision) {
        setMerge(data);
        return;
      }

      if (response.ok) {
        showToast(getSendResultMessage(data));
      } else {
        showToast(
          data.error ||
            "Could not send payment link."
        );
      }
    } catch {
      showToast(
        "Could not connect to the payment-link service."
      );
    } finally {
      setSending(null);
    }
  }

  async function mergeAndSend() {
    if (!merge) return;

    const checkboxes =
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          ".mergeStudentCheckbox:checked"
        )
      );

    const studentIds =
      checkboxes.map(
        (checkbox) =>
          checkbox.value
      );

    if (studentIds.length === 0) {
      showToast(
        "Select at least one student to merge."
      );
      return;
    }

    setSending(
      merge.student?.id || null
    );

    try {
      const response = await fetch(
        "/api/admin/payment-links/send",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            studentId:
              merge.student?.id,

            studentIds,

            mergeConfirmed: true,

            month,
          }),
        }
      );

      const data =
        await readJson(response);

      if (response.ok) {
        const count =
          Array.isArray(data.studentIds)
            ? data.studentIds.length
            : studentIds.length;

        showToast(
          `Combined payment link sent for ${count} students. ${getSendResultMessage(data)}`
        );

        setMerge(null);
      } else {
        showToast(
          data.error ||
            "Could not send combined payment link."
        );
      }
    } catch {
      showToast(
        "Could not connect to the payment-link service."
      );
    } finally {
      setSending(null);
    }
  }

  async function approveInvoice(
    invoiceId: string
  ) {
    try {
      const response = await fetch(
        `/api/admin/payments/${invoiceId}/approve`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        setInvoices((current) =>
          current.map((invoice) =>
            invoice.id === invoiceId
              ? {
                  ...invoice,
                  status: "PAID",
                  paid_at:
                    new Date().toISOString(),
                }
              : invoice
          )
        );

        showToast(
          "Payment verified successfully."
        );
      } else {
        showToast(
          "Payment verification failed."
        );
      }
    } catch {
      showToast(
        "Could not connect to the verification service."
      );
    }
  }

  async function approveGroup(
    groupId: string
  ) {
    try {
      const response = await fetch(
        `/api/admin/payment-groups/${groupId}/approve`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        showToast(
          "Combined payment verified. Refreshing…"
        );

        window.location.reload();
      } else {
        showToast(
          "Combined payment verification failed."
        );
      }
    } catch {
      showToast(
        "Could not connect to the verification service."
      );
    }
  }

  function exportCsv() {
    const header = [
      "S.NUMBER",
      "STUDENT NAME",
      "AGE",
      "COUNTRY NAME",
      "TIMING AS PER COUNTRY",
      "DAYS",
      "FEE",
      "PARENTS NAME",
      "PARENT EMAIL",
      "PARENT PHONE",
      "WHATSAPP",
      "GENDER",
      "TEACHER",
      "GROUPS",
      "CURRENCY",
      "ACTIVE",
    ];

    const rows = students.map(
      (student) => [
        student.serial_number,
        student.student_name,
        student.age || "",
        student.country,
        student.timing || "",
        student.days || "",
        student.monthly_fee,
        student.parent_name || "",
        student.parent_email || "",
        student.parent_phone || "",
        student.whatsapp_phone || "",
        student.gender || "",
        student.teacher_name || "",
        (
          Array.isArray(
            student.groups
          )
            ? student.groups
            : []
        ).join("|"),
        student.currency,
        student.active
          ? "YES"
          : "NO",
      ]
    );

    const csv = [
      header,
      ...rows,
    ]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(
                value ?? ""
              ).replace(
                /"/g,
                '""'
              )}"`
          )
          .join(",")
      )
      .join("\n");

    const url =
      URL.createObjectURL(
        new Blob([csv], {
          type: "text/csv;charset=utf-8",
        })
      );

    const anchor =
      document.createElement("a");

    anchor.href = url;

    anchor.download =
      `global-punjabi-students-${month}.csv`;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(url);
  }

  const mergeStudentName =
    merge?.student?.student_name ||
    merge?.student?.name ||
    "Student";

  const mergeMatches =
    Array.isArray(merge?.matches)
      ? merge.matches
      : [];

  return (
    <main
      className="container"
      style={{
        padding:
          "30px 20px 80px",
      }}
    >
      <div className="adminHeader">
        <div>
          <div className="eyebrow">
            PRIVATE OPERATOR AREA
          </div>

          <h1
            style={{
              margin: "6px 0",
            }}
          >
            Global Punjabi Classes — Admin
          </h1>

          <p
            style={{
              color: "#64748b",
            }}
          >
            Fee operations ·{" "}
            {new Date(
              month
            ).toLocaleString(
              "en-US",
              {
                month: "long",
                year: "numeric",
              }
            )}
          </p>
        </div>

        <div className="headerActions">
          <a
            href="/"
            className="btn btnGhost"
          >
            Public Home
          </a>

          <button
            className="btn btnGhost"
            onClick={async () => {
              await fetch(
                "/api/admin/logout",
                {
                  method: "POST",
                }
              );

              window.location.href =
                "/admin/login";
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="grid grid4 statsGrid">
        <div className="card stat">
          <div className="n">
            {counts.total}
          </div>

          <div className="l">
            Total Students
          </div>
        </div>

        <div className="card stat">
          <div className="n">
            {counts.active}
          </div>

          <div className="l">
            Active Students
          </div>
        </div>

        <div className="card stat">
          <div className="n">
            {counts.inactive}
          </div>

          <div className="l">
            Not Active
          </div>
        </div>

        <div className="card stat">
          <div className="n">
            {counts.received}
          </div>

          <div className="l">
            Received This Month
          </div>
        </div>
      </div>

      <div
        className="grid grid3"
        style={{
          marginBottom: 18,
        }}
      >
        <div className="card miniStat">
          <b>{counts.pending}</b>
          <span>
            Pending payments
          </span>
        </div>

        <div className="card miniStat">
          <b>{counts.progress}</b>
          <span>
            In progress
          </span>
        </div>

        <div className="card miniStat">
          <b>{teachers.length}</b>
          <span>Teachers</span>
        </div>
      </div>

      <section className="card dashboardSection">
        <div className="sectionHeading">
          <div>
            <div className="eyebrow">
              Student intelligence
            </div>

            <h2>
              Search &amp; Filters
            </h2>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btnPrimary"
              onClick={() => setAddStudentOpen(true)}
            >
              + Add Student
            </button>

            <button
              className="btn btnGold"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="filterGrid">
          <input
            placeholder="Search student, age, days, teacher, country…"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
          />

          <select
            value={country}
            onChange={(event) =>
              setCountry(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Countries
            </option>

            {COUNTRIES.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={currency}
            onChange={(event) =>
              setCurrency(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Currencies
            </option>

            {CURRENCIES.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={teacher}
            onChange={(event) =>
              setTeacher(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Teachers
            </option>

            {teachers.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={group}
            onChange={(event) =>
              setGroup(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Groups
            </option>

            {GROUPS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={gender}
            onChange={(event) =>
              setGender(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Genders
            </option>

            <option value="Male">
              Male
            </option>

            <option value="Female">
              Female
            </option>
          </select>

          <select
            value={paymentStatus}
            onChange={(event) =>
              setPaymentStatus(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All Payment Status
            </option>

            <option value="PENDING">
              Pending
            </option>

            <option value="PROCESSING">
              In Progress
            </option>

            <option value="VERIFYING">
              In Progress
            </option>

            <option value="PAID">
              Received
            </option>
          </select>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Student</th>
                <th>Age</th>
                <th>Country</th>
                <th>Days</th>
                <th>Teacher</th>
                <th>Groups</th>
                <th>Currency</th>
                <th>Fee</th>
                <th>Payment</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map(
                ({
                  student,
                  invoice,
                }) => (
                  <tr
                    key={student.id}
                  >
                    <td>
                      {
                        student.serial_number
                      }
                    </td>

                    <td>
                      <b>
                        {
                          student.student_name
                        }
                      </b>

                      <br />

                      <small>
                        {
                          student.gender ||
                          ""
                        }
                      </small>
                    </td>

                    <td>
                      {student.age ||
                        "—"}
                    </td>

                    <td>
                      {student.country}
                    </td>

                    <td>
                      {student.days ||
                        "—"}
                    </td>

                    <td>
                      {student.teacher_name ||
                        "—"}
                    </td>

                    <td>
                      {(
                        Array.isArray(
                          student.groups
                        )
                          ? student.groups
                          : []
                      ).join(", ") ||
                        "—"}
                    </td>

                    <td>
                      {
                        invoice?.currency ||
                        student.currency
                      }
                    </td>

                    <td>
                      {invoice
                        ? `${invoice.currency} ${invoice.amount}`
                        : `${student.currency} ${student.monthly_fee}`}
                    </td>

                    <td>
                      {invoice ? (
                        <>
                          <span
                            className={`statusPill ${statusClass(
                              invoice.status
                            )}`}
                          >
                            {statusLabel(
                              invoice.status
                            )}
                          </span>

                          {invoice.payment_method && (
                            <small className="methodLabel">
                              {formatMethod(
                                invoice.payment_method
                              )}
                            </small>
                          )}
                        </>
                      ) : (
                        <span className="statusPill statusPending">
                          NO INVOICE
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="actionStack">
                        <button
                          className="btn btnGhost btnSmall"
                          disabled={
                            sending ===
                              student.id ||
                            !student.active
                          }
                          onClick={() =>
                            sendLink(
                              student.id
                            )
                          }
                        >
                          {sending ===
                          student.id
                            ? "Sending…"
                            : student.active
                              ? "Send Link"
                              : "Inactive"}
                        </button>

                        {invoice && (
                          <button
                            className="btn btnGhost btnSmall"
                            onClick={() =>
                              setProcessView(
                                {
                                  invoice,
                                  student,
                                }
                              )
                            }
                          >
                            View Process
                          </button>
                        )}

                        {invoice?.status ===
                          "VERIFYING" && (
                          <button
                            className="btn btnPrimary btnSmall"
                            onClick={() =>
                              approveInvoice(
                                invoice.id
                              )
                            }
                          >
                            Verify
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="grid grid2"
        style={{
          marginTop: 18,
        }}
      >
        <div className="card dashboardSection">
          <div className="sectionHeading">
            <div>
              <div className="eyebrow">
                Teachers
              </div>

              <h2>
                Teacher Overview
              </h2>
            </div>
          </div>

          {teacherStats.length ? (
            <div className="teacherList">
              {teacherStats.map(
                (item) => (
                  <div
                    className="teacherRow"
                    key={item.name}
                  >
                    <div>
                      <b>
                        {item.name}
                      </b>

                      <div className="mutedText">
                        {item.students.join(
                          ", "
                        )}
                      </div>
                    </div>

                    <span className="countBadge">
                      {item.count} students
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="notice">
              Add teacher names to your
              student data to populate
              this section.
            </div>
          )}
        </div>

        <div className="card dashboardSection">
          <div className="sectionHeading">
            <div>
              <div className="eyebrow">
                Currencies
              </div>

              <h2>
                Fee Breakdown
              </h2>
            </div>
          </div>

          <div className="currencyList">
            {currencyStats.map(
              (item) => (
                <div
                  className="currencyRow"
                  key={item.currency}
                >
                  <b>
                    {item.currency}
                  </b>

                  <span>
                    {item.count} students
                  </span>

                  <strong>
                    {item.currency}{" "}
                    {item.total.toFixed(
                      2
                    )}
                  </strong>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {addStudentOpen && (
        <div className="modalBackdrop studentModalBackdrop">
          <style>{`
            .studentModalBackdrop {
              align-items: center;
              justify-content: center;
              padding: 18px;
              overflow: hidden;
            }

            .studentModal {
              width: min(980px, 100%);
              max-width: 980px !important;
              max-height: min(92vh, 900px);
              padding: 0 !important;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              border-radius: 22px;
            }

            .studentModalHeader {
              flex: 0 0 auto;
              padding: 24px 28px 18px;
              border-bottom: 1px solid #e8edf5;
              background: #fff;
            }

            .studentModalHeader h2 {
              margin: 5px 0 4px;
              font-size: 25px;
            }

            .studentModalHeader p {
              margin: 0;
              color: #64748b;
              font-size: 13px;
            }

            .studentModalBody {
              flex: 1 1 auto;
              overflow-y: auto;
              padding: 24px 28px 28px;
              background: #fbfcfe;
            }

            .studentFormSection {
              background: #fff;
              border: 1px solid #e5eaf2;
              border-radius: 16px;
              padding: 18px;
              margin-bottom: 16px;
            }

            .studentFormSection:last-child {
              margin-bottom: 0;
            }

            .studentFormSectionTitle {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 15px;
              color: #071f49;
              font-size: 16px;
              font-weight: 800;
            }

            .studentFormSectionTitle span {
              width: 28px;
              height: 28px;
              display: grid;
              place-items: center;
              border-radius: 9px;
              background: #eef3fa;
              color: #071f49;
              font-size: 13px;
              font-weight: 900;
            }

            .studentFormGrid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 15px 18px;
            }

            .studentField {
              min-width: 0;
            }

            .studentField.full {
              grid-column: 1 / -1;
            }

            .studentField label {
              display: block;
              margin: 0 0 7px;
              color: #263750;
              font-size: 12px;
              font-weight: 800;
            }

            .studentField label .required {
              color: #d18b00;
            }

            .studentField input,
            .studentField select {
              width: 100%;
              min-height: 48px;
              box-sizing: border-box;
              padding: 12px 14px;
              border: 1px solid #dbe3ee;
              border-radius: 11px;
              background: #fff;
              color: #12203a;
              font-size: 14px;
              outline: none;
            }

            .studentField input:focus,
            .studentField select:focus {
              border-color: #b98510;
              box-shadow: 0 0 0 3px rgba(185,133,16,.10);
            }

            .studentGroups {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px;
            }

            .studentGroupOption {
              display: flex;
              align-items: center;
              gap: 9px;
              min-height: 48px;
              padding: 0 13px;
              box-sizing: border-box;
              border: 1px solid #dbe3ee;
              border-radius: 11px;
              background: #fff;
              color: #263750;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
            }

            .studentGroupOption:has(input:checked) {
              border-color: #c99522;
              background: #fffbef;
            }

            .studentGroupOption input,
            .studentActive input {
              width: 17px;
              height: 17px;
              margin: 0;
              accent-color: #b98510;
            }

            .studentActive {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-top: 14px;
              color: #263750;
              font-size: 13px;
              font-weight: 800;
              cursor: pointer;
            }

            .studentModalFooter {
              flex: 0 0 auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              padding: 16px 28px;
              border-top: 1px solid #e8edf5;
              background: #fff;
            }

            .studentFooterHint {
              color: #64748b;
              font-size: 12px;
            }

            .studentFooterActions {
              display: flex;
              gap: 9px;
              flex-wrap: wrap;
              justify-content: flex-end;
            }

            .studentFooterActions .btn {
              min-height: 44px;
            }

            @media (max-width: 760px) {
              .studentModalBackdrop {
                padding: 10px;
              }

              .studentModal {
                max-height: 96vh;
                border-radius: 16px;
              }

              .studentModalHeader,
              .studentModalBody {
                padding-left: 18px;
                padding-right: 18px;
              }

              .studentFormGrid {
                grid-template-columns: 1fr;
              }

              .studentField.full {
                grid-column: auto;
              }

              .studentGroups {
                grid-template-columns: 1fr;
              }

              .studentModalFooter {
                padding: 14px 18px;
                align-items: stretch;
                flex-direction: column;
              }

              .studentFooterActions {
                width: 100%;
              }

              .studentFooterActions .btn {
                flex: 1 1 auto;
              }
            }
          `}</style>

          <div className="modal card studentModal">
            <div className="studentModalHeader">
              <div className="eyebrow">STUDENT MANAGEMENT</div>
              <h2>Add Student</h2>
              <p>
                Enter the student details below. You can add one student or keep
                this form open and continue adding students.
              </p>
            </div>

            <div className="studentModalBody">
              <section className="studentFormSection">
                <div className="studentFormSectionTitle">
                  <span>1</span>
                  Student Information
                </div>

                <div className="studentFormGrid">
                  <div className="studentField">
                    <label>
                      Serial Number <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 21"
                      value={studentForm.serial_number}
                      onChange={(event) =>
                        updateStudentForm(
                          "serial_number",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>
                      Student Name <span className="required">*</span>
                    </label>
                    <input
                      placeholder="Full student name"
                      value={studentForm.student_name}
                      onChange={(event) =>
                        updateStudentForm(
                          "student_name",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Age</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      placeholder="Student age"
                      value={studentForm.age}
                      onChange={(event) =>
                        updateStudentForm(
                          "age",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Gender</label>
                    <select
                      value={studentForm.gender}
                      onChange={(event) =>
                        updateStudentForm(
                          "gender",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div className="studentField">
                    <label>
                      Country <span className="required">*</span>
                    </label>
                    <select
                      value={studentForm.country}
                      onChange={(event) =>
                        updateStudentForm(
                          "country",
                          event.target.value
                        )
                      }
                    >
                      {COUNTRIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="studentField">
                    <label>
                      Currency <span className="required">*</span>
                    </label>
                    <select
                      value={studentForm.currency}
                      onChange={(event) =>
                        updateStudentForm(
                          "currency",
                          event.target.value
                        )
                      }
                    >
                      {CURRENCIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="studentField">
                    <label>
                      Monthly Fee <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 100"
                      value={studentForm.monthly_fee}
                      onChange={(event) =>
                        updateStudentForm(
                          "monthly_fee",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Class Timing</label>
                    <input
                      placeholder="e.g. 6–7 PM"
                      value={studentForm.timing}
                      onChange={(event) =>
                        updateStudentForm(
                          "timing",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Days</label>
                    <input
                      placeholder="e.g. Mon, Wed, Sat"
                      value={studentForm.days}
                      onChange={(event) =>
                        updateStudentForm(
                          "days",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Teacher Name</label>
                    <input
                      placeholder="Teacher name"
                      value={studentForm.teacher_name}
                      onChange={(event) =>
                        updateStudentForm(
                          "teacher_name",
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="studentFormSection">
                <div className="studentFormSectionTitle">
                  <span>2</span>
                  Parent / Contact Details
                </div>

                <div className="studentFormGrid">
                  <div className="studentField">
                    <label>Parent Name</label>
                    <input
                      placeholder="Parent / guardian name"
                      value={studentForm.parent_name}
                      onChange={(event) =>
                        updateStudentForm(
                          "parent_name",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Parent Email</label>
                    <input
                      type="email"
                      placeholder="parent@example.com"
                      value={studentForm.parent_email}
                      onChange={(event) =>
                        updateStudentForm(
                          "parent_email",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>Parent Phone</label>
                    <input
                      type="tel"
                      placeholder="+1 000 000 0000"
                      value={studentForm.parent_phone}
                      onChange={(event) =>
                        updateStudentForm(
                          "parent_phone",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="studentField">
                    <label>WhatsApp Number</label>
                    <input
                      type="tel"
                      placeholder="+1 000 000 0000"
                      value={studentForm.whatsapp_phone}
                      onChange={(event) =>
                        updateStudentForm(
                          "whatsapp_phone",
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="studentFormSection">
                <div className="studentFormSectionTitle">
                  <span>3</span>
                  Learning Groups
                </div>

                <div className="studentGroups">
                  {GROUPS.map((item) => (
                    <label
                      className="studentGroupOption"
                      key={item}
                    >
                      <input
                        type="checkbox"
                        checked={studentForm.groups.includes(item)}
                        onChange={() =>
                          toggleStudentGroup(item)
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>

                <label className="studentActive">
                  <input
                    type="checkbox"
                    checked={studentForm.active}
                    onChange={(event) =>
                      updateStudentForm(
                        "active",
                        event.target.checked
                      )
                    }
                  />
                  Student is Active
                </label>
              </section>
            </div>

            <div className="studentModalFooter">
              <div className="studentFooterHint">
                * Required fields
              </div>

              <div className="studentFooterActions">
                <button
                  className="btn btnGhost"
                  onClick={() =>
                    setAddStudentOpen(false)
                  }
                  disabled={addingStudent}
                >
                  Cancel
                </button>

                <button
                  className="btn btnPrimary"
                  onClick={() => addStudent(true)}
                  disabled={addingStudent}
                >
                  {addingStudent
                    ? "Saving..."
                    : "Add & Add Another"}
                </button>

                <button
                  className="btn btnGold"
                  onClick={() => addStudent(false)}
                  disabled={addingStudent}
                >
                  {addingStudent
                    ? "Saving..."
                    : "Add Student"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {processView && (
        <div className="modalBackdrop">
          <div className="modal card">
            <div className="eyebrow">
              PAYMENT PROCESS
            </div>

            <h2>
              {
                processView.student
                  .student_name
              }
            </h2>

            <div className="processTimeline">
              <div className="processStep done">
                <b>
                  Payment link generated
                </b>

                <span>
                  Secure invoice link is
                  associated with this
                  student.
                </span>
              </div>

              <div
                className={`processStep ${
                  processView.invoice
                    .status !==
                  "PENDING"
                    ? "done"
                    : ""
                }`}
              >
                <b>
                  Payment initiated
                </b>

                <span>
                  {processView.invoice
                    .payment_method
                    ? formatMethod(
                        processView
                          .invoice
                          .payment_method
                      )
                    : "Awaiting payment"}
                </span>
              </div>

              <div
                className={`processStep ${
                  processView.invoice
                    .status === "PAID"
                    ? "done"
                    : ""
                }`}
              >
                <b>
                  Payment verification
                </b>

                <span>
                  {processView.invoice
                    .payment_reference ||
                    processView.invoice
                      .provider_transaction_id ||
                    "Awaiting provider confirmation/reference"}
                </span>
              </div>

              <div
                className={`processStep ${
                  processView.invoice
                    .status === "PAID"
                    ? "done"
                    : ""
                }`}
              >
                <b>
                  Payment status
                </b>

                <span>
                  {statusLabel(
                    processView.invoice
                      .status
                  )}
                </span>
              </div>
            </div>

            <div className="modalActions">
              <button
                className="btn btnGhost"
                onClick={() =>
                  setProcessView(null)
                }
              >
                Close
              </button>

              {processView.invoice
                .status ===
                "VERIFYING" && (
                <button
                  className="btn btnGold"
                  onClick={async () => {
                    await approveInvoice(
                      processView
                        .invoice.id
                    );

                    setProcessView(
                      null
                    );
                  }}
                >
                  Verify Payment
                </button>
              )}

              {processView.invoice
                .payment_group_id && (
                <button
                  className="btn btnPrimary"
                  onClick={() =>
                    approveGroup(
                      processView.invoice
                        .payment_group_id
                    )
                  }
                >
                  Verify Combined Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {merge && (
        <div className="modalBackdrop">
          <div className="modal card">
            <div className="eyebrow">
              MULTIPLE STUDENTS DETECTED
            </div>

            <h2>
              Merge payment for this
              parent?
            </h2>

            <p>
              The system found other
              student records using the
              same parent email/WhatsApp
              number.
            </p>

            <div className="mergeList">
              <div className="mergeItem">
                <b>
                  {mergeStudentName}
                </b>

                <span>
                  Primary student
                </span>
              </div>

              {mergeMatches.map(
                (item: AnyRecord) => (
                  <label
                    className="mergeItem"
                    key={item.id}
                  >
                    <input
                      className="mergeStudentCheckbox"
                      type="checkbox"
                      defaultChecked
                      value={item.id}
                    />

                    <div>
                      <b>
                        {item.student_name ||
                          item.name}
                      </b>

                      <span>
                        {item.currency}{" "}
                        {item.fee} ·{" "}
                        {item.country}
                      </span>
                    </div>
                  </label>
                )
              )}
            </div>

            <div className="modalActions">
              <button
                className="btn btnGhost"
                onClick={() => {
                  const studentId =
                    merge.student?.id;

                  setMerge(null);

                  if (studentId) {
                    void sendLinkSeparate(
                      studentId
                    );
                  }
                }}
              >
                Send Separately
              </button>

              <button
                className="btn btnGold"
                onClick={mergeAndSend}
              >
                Merge &amp; Send One Link
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}
    </main>
  );
}
