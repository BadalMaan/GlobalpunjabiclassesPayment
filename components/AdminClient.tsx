"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

function formatAmount(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
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

  // Stores the secure URL returned after a merged payment link is created,
  // so the operator can copy it directly from the merge window.
  const [mergePaymentLink, setMergePaymentLink] =
    useState("");

  const [processView, setProcessView] =
    useState<AnyRecord | null>(null);

  const [sending, setSending] =
    useState<string | null>(null);

  const [toast, setToast] = useState("");

  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [editingStudent, setEditingStudent] =
    useState<AnyRecord | null>(null);
  const [deletingStudent, setDeletingStudent] =
    useState<string | null>(null);

  const [openActionsId, setOpenActionsId] =
    useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, right: 18 });

  const [customFeeStudent, setCustomFeeStudent] =
    useState<AnyRecord | null>(null);

  const [customFeeAmount, setCustomFeeAmount] =
    useState("");

  const [customFeeCurrency, setCustomFeeCurrency] =
    useState("AUD");

  const [customFeeDescription, setCustomFeeDescription] =
    useState("Custom Fee");

  const [customFeeBusy, setCustomFeeBusy] =
    useState(false);

  const [customFeeLink, setCustomFeeLink] =
    useState("");

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

  // Fast in-page navigation. These refs avoid reloads and jump
  // directly to the requested student section.
  const studentDirectoryRef = useRef<HTMLDivElement | null>(null);
  const activeStudentsRef = useRef<HTMLDivElement | null>(null);
  const inactiveStudentsRef = useRef<HTMLDivElement | null>(null);

  function scrollToSection(
    ref: { current: HTMLDivElement | null }
  ) {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest?.("[data-student-actions]")) {
        setOpenActionsId(null);
      }
    }

    document.addEventListener("click", handleDocumentClick);

    function closeActionMenuOnViewportChange() {
      setOpenActionsId(null);
    }

    window.addEventListener("scroll", closeActionMenuOnViewportChange, true);
    window.addEventListener("resize", closeActionMenuOnViewportChange);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      window.removeEventListener("scroll", closeActionMenuOnViewportChange, true);
      window.removeEventListener("resize", closeActionMenuOnViewportChange);
    };
  }, []);

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

  function openAddStudent() {
    setEditingStudent(null);
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
    setAddStudentOpen(true);
  }

  function openEditStudent(student: AnyRecord) {
    setEditingStudent(student);
    setStudentForm({
      serial_number: String(student.serial_number ?? ""),
      student_name: String(student.student_name ?? ""),
      age:
        student.age === null ||
        student.age === undefined
          ? ""
          : String(student.age),
      country: String(student.country ?? "USA"),
      timing: String(student.timing ?? ""),
      days: String(student.days ?? ""),
      monthly_fee:
        student.monthly_fee === null ||
        student.monthly_fee === undefined
          ? ""
          : String(student.monthly_fee),
      parent_name: String(student.parent_name ?? ""),
      parent_email: String(student.parent_email ?? ""),
      parent_phone: String(student.parent_phone ?? ""),
      whatsapp_phone: String(student.whatsapp_phone ?? ""),
      gender: String(student.gender ?? ""),
      teacher_name: String(student.teacher_name ?? ""),
      groups: Array.isArray(student.groups)
        ? student.groups
        : [],
      currency: String(student.currency ?? "USD"),
      active: student.active !== false,
    });
    setAddStudentOpen(true);
  }

  async function updateStudent() {
    if (!editingStudent?.id) return;

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
      const response = await fetch(
        `/api/admin/students/${editingStudent.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...studentForm,
            age: studentForm.age
              ? Number(studentForm.age)
              : null,
            monthly_fee: Number(
              studentForm.monthly_fee
            ),
            groups: studentForm.groups,
          }),
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        showToast(
          data.error || "Could not update student."
        );
        return;
      }

      if (data.student) {
        setStudents((current) =>
          current.map((item) =>
            item.id === editingStudent.id
              ? data.student
              : item
          )
        );
      }

      // If the current month's invoice is still pending, the API keeps it
      // synchronized with the student's new fee/currency. Update the local
      // dashboard state immediately so the table shows the new amount
      // without requiring a page refresh.
      if (data.invoice?.id) {
        setInvoices((current) =>
          current.map((invoice) =>
            invoice.id === data.invoice.id
              ? data.invoice
              : invoice
          )
        );
      }

      setAddStudentOpen(false);
      setEditingStudent(null);
      showToast("Student updated successfully.");
    } catch {
      showToast(
        "Could not connect to the student service."
      );
    } finally {
      setAddingStudent(false);
    }
  }

  async function deleteStudent(student: AnyRecord) {
    if (!student?.id) return;

    const confirmed = window.confirm(
      `Delete ${student.student_name || "this student"} permanently? This will also remove this student's fee invoices and message records.`
    );

    if (!confirmed) return;

    setDeletingStudent(student.id);

    try {
      const response = await fetch(
        `/api/admin/students/${student.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        showToast(
          data.error || "Could not delete student."
        );
        return;
      }

      setStudents((current) =>
        current.filter(
          (item) => item.id !== student.id
        )
      );

      setInvoices((current) =>
        current.filter(
          (invoice) =>
            invoice.student_id !== student.id
        )
      );

      showToast("Student deleted successfully.");
    } catch {
      showToast(
        "Could not connect to the student service."
      );
    } finally {
      setDeletingStudent(null);
    }
  }

  async function copyFeeLink(
    invoice: AnyRecord | undefined
  ) {
    if (!invoice?.id) {
      showToast(
        "No payment invoice is available for this student."
      );
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/payment-links/${invoice.id}`,
        {
          method: "GET",
        }
      );

      const data = await readJson(response);

      if (!response.ok || !data.paymentUrl) {
        showToast(
          data.error ||
            "Fee link is not available yet. Please use Send Link first."
        );
        return;
      }

      await navigator.clipboard.writeText(
        data.paymentUrl
      );

      showToast("Fee payment link copied.");
    } catch {
      showToast(
        "Could not copy the fee payment link."
      );
    }
  }

  function openCustomFee(student: AnyRecord) {
    setOpenActionsId(null);
    setCustomFeeStudent(student);
    setCustomFeeAmount("");
    setCustomFeeCurrency(
      String(student.currency || "AUD").toUpperCase()
    );
    setCustomFeeDescription("Custom Fee");
    setCustomFeeLink("");
  }

  function closeCustomFee() {
    if (customFeeBusy) return;

    setCustomFeeStudent(null);
    setCustomFeeAmount("");
    setCustomFeeLink("");
  }

  async function createCustomFeeLink() {
    if (!customFeeStudent?.id) return;

    const amount = Number(customFeeAmount);
    const selectedCurrency = String(
      customFeeCurrency || ""
    ).toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Please enter a valid custom fee amount.");
      return;
    }

    if (!CURRENCIES.includes(selectedCurrency)) {
      showToast("Please select a supported currency.");
      return;
    }

    setCustomFeeBusy(true);
    setCustomFeeLink("");

    try {
      const response = await fetch(
        "/api/admin/payment-links/custom",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            studentId: customFeeStudent.id,
            month,
            amount,
            currency: selectedCurrency,
            description:
              customFeeDescription.trim() || "Custom Fee",
          }),
        }
      );

      const data = await readJson(response);

      if (!response.ok || !data.paymentUrl) {
        showToast(
          data.error ||
            "Could not create custom payment link."
        );
        return;
      }

      setCustomFeeLink(data.paymentUrl);
      showToast(
        "Custom payment link created successfully."
      );
    } catch {
      showToast(
        "Could not connect to the custom payment service."
      );
    } finally {
      setCustomFeeBusy(false);
    }
  }

  async function copyCustomFeeLink() {
    if (!customFeeLink) return;

    try {
      await navigator.clipboard.writeText(
        customFeeLink
      );
      showToast("Custom payment link copied.");
    } catch {
      showToast(
        "Could not copy the custom payment link."
      );
    }
  }

  async function shareCustomFeeLink() {
    if (!customFeeLink) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title:
            `Global Punjabi Classes — ${
              customFeeStudent?.student_name ||
              "Custom Fee"
            }`,
          text:
            `Payment link for ${
              customFeeStudent?.student_name ||
              "student"
            } — ${customFeeCurrency} ${Number(
              customFeeAmount || 0
            ).toFixed(2)}`,
          url: customFeeLink,
        });

        return;
      }

      await navigator.clipboard.writeText(
        customFeeLink
      );

      showToast(
        "Sharing is not available here. The payment link was copied instead."
      );
    } catch (error: any) {
      if (error?.name === "AbortError") return;

      showToast(
        "Could not share the custom payment link."
      );
    }
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
    const map = new Map<string, AnyRecord>();

    for (const invoice of invoices) {
      const studentId = invoice.student_id;

      if (!studentId) continue;

      const current = map.get(studentId);

      const isCustom = String(
        invoice.invoice_number || ""
      ).startsWith("GPC-CUSTOM-");

      const currentIsCustom = String(
        current?.invoice_number || ""
      ).startsWith("GPC-CUSTOM-");

      if (!current || (currentIsCustom && !isCustom)) {
        map.set(studentId, invoice);
      }
    }

    return map;
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

  // Keep Active and Not Active lists completely separate while still
  // respecting all search/filter controls above.
  const activeRows = useMemo(
    () =>
      visibleRows.filter(
        ({ student }) => student.active !== false
      ),
    [visibleRows]
  );

  const inactiveRows = useMemo(
    () =>
      visibleRows.filter(
        ({ student }) => student.active === false
      ),
    [visibleRows]
  );

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

  const receivedCurrencyStats = useMemo(() => {
    return CURRENCIES.map((item) => {
      const paidInvoices = invoices.filter(
        (invoice) =>
          invoice.status === "PAID" &&
          String(invoice.currency || "").toUpperCase() === item
      );

      return {
        currency: item,
        count: paidInvoices.length,
        total: paidInvoices.reduce(
          (total, invoice) =>
            total + Number(invoice.amount || 0),
          0
        ),
      };
    });
  }, [invoices]);

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

    const emailReason =
      data?.email?.reason ||
      data?.email?.error ||
      data?.email?.message ||
      "";

    const whatsappReason =
      data?.whatsapp?.reason ||
      data?.whatsapp?.error ||
      data?.whatsapp?.message ||
      "";

    const emailText =
      emailStatus === "SENT"
        ? "Email sent"
        : emailStatus === "QUEUED"
          ? "Email queued"
          : emailStatus === "FAILED"
            ? `Email failed${emailReason ? `: ${emailReason}` : ""}`
            : `Email skipped${emailReason ? `: ${emailReason}` : ""}`;

    const whatsappText =
      whatsappStatus === "SENT"
        ? "WhatsApp sent"
        : whatsappStatus === "QUEUED"
          ? "WhatsApp queued"
          : whatsappStatus === "FAILED"
            ? `WhatsApp failed${whatsappReason ? `: ${whatsappReason}` : ""}`
            : `WhatsApp skipped${whatsappReason ? `: ${whatsappReason}` : ""}`;

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
      return "Payment link created. Email and WhatsApp delivery queued.";
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

  async function copyMergedPaymentLink() {
    if (!mergePaymentLink) return;

    try {
      await navigator.clipboard.writeText(
        mergePaymentLink
      );
      showToast("Merged payment link copied.");
    } catch {
      showToast("Could not copy the merged payment link.");
    }
  }

  async function mergeAndSend() {
    if (!merge) return;

    setMergePaymentLink("");

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

        if (data.paymentUrl) {
          setMergePaymentLink(
            String(data.paymentUrl)
          );
        }

        showToast(
          `Combined payment link sent for ${count} students. ${getSendResultMessage(data)}`
        );
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
        // Do not reload the whole dashboard. Keep the UI instant and
        // update every invoice belonging to this payment group locally.
        setInvoices((current) =>
          current.map((invoice) =>
            invoice.payment_group_id === groupId
              ? {
                  ...invoice,
                  status: "PAID",
                  paid_at:
                    invoice.paid_at ||
                    new Date().toISOString(),
                }
              : invoice
          )
        );

        setProcessView(null);
        showToast(
          "Combined payment verified successfully."
        );
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

  function renderStudentRow({
    student,
    invoice,
  }: {
    student: AnyRecord;
    invoice: AnyRecord | undefined;
  }) {
    return (
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

                          {invoice.status === "PAID" && (
                            <small className="methodLabel">
                              Received:{" "}
                              {formatAmount(
                                invoice.currency,
                                Number(invoice.amount || 0)
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
                      <div
                        className="studentActionMenu"
                        data-student-actions
                        style={{
                          position: "relative",
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btnPrimary btnSmall"
                          onClick={(event) => {
                            event.stopPropagation();

                            if (openActionsId === student.id) {
                              setOpenActionsId(null);
                              return;
                            }

                            const rect = event.currentTarget.getBoundingClientRect();
                            const menuHeight = Math.min(520, window.innerHeight - 32);
                            const gap = 8;
                            const below = rect.bottom + gap;
                            const top =
                              below + menuHeight <= window.innerHeight - 12
                                ? below
                                : Math.max(12, rect.top - menuHeight - gap);

                            setActionMenuPosition({
                              top,
                              right: Math.max(12, window.innerWidth - rect.right),
                            });
                            setOpenActionsId(student.id);
                          }}
                          aria-expanded={
                            openActionsId === student.id
                          }
                          aria-haspopup="menu"
                        >
                          {sending === student.id
                            ? "Working…"
                            : "••• Actions"}
                        </button>

                        {openActionsId === student.id &&
                          typeof document !== "undefined" &&
                          createPortal(
                            <div
                              className="gpcStudentActionPanel"
                            role="menu"
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                            style={{
                              position: "fixed",
                              top: actionMenuPosition.top,
                              right: actionMenuPosition.right,
                              zIndex: 2147483647,
                              width: 300,
                              padding: 8,
                              border:
                                "1px solid rgba(214,223,235,.95)",
                              borderRadius: 18,
                              background:
                                "rgba(255,255,255,.98)",
                              boxShadow:
                                "0 24px 60px rgba(11,42,91,.18), 0 8px 24px rgba(11,42,91,.08)",
                              backdropFilter: "blur(18px)",
                            }}
                          >
                            <div
                              style={{
                                padding: "8px 10px 6px",
                                fontSize: 10,
                                fontWeight: 900,
                                letterSpacing: ".14em",
                                color: "#8a6516",
                              }}
                            >
                              PAYMENT
                            </div>

                            <button
                              type="button"
                              className="studentActionItem studentActionItemPrimary"
                              disabled={
                                sending === student.id ||
                                !student.active
                              }
                              onClick={() => {
                                setOpenActionsId(null);

                                if (student.active) {
                                  void sendLink(student.id);
                                }
                              }}
                            >
                              <span className="studentActionIcon">
                                ↗
                              </span>

                              <span>
                                <b>
                                  {sending === student.id
                                    ? "Sending…"
                                    : student.active
                                      ? "Send Payment Link"
                                      : "Student Inactive"}
                                </b>
                                <small>
                                  Send the normal monthly fee link
                                </small>
                              </span>
                            </button>

                            <button
                              type="button"
                              className="studentActionItem"
                              onClick={() =>
                                openCustomFee(student)
                              }
                            >
                              <span className="studentActionIcon">
                                ＋
                              </span>

                              <span>
                                <b>Custom Fee</b>
                                <small>
                                  Create a one-time amount
                                </small>
                              </span>
                            </button>

                            {invoice && (
                              <>
                                <button
                                  type="button"
                                  className="studentActionItem"
                                  onClick={() => {
                                    setOpenActionsId(null);
                                    void copyFeeLink(
                                      invoice
                                    );
                                  }}
                                >
                                  <span className="studentActionIcon">
                                    ⧉
                                  </span>

                                  <span>
                                    <b>
                                      Copy Payment Link
                                    </b>
                                    <small>
                                      Copy the current invoice link
                                    </small>
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  className="studentActionItem"
                                  onClick={() => {
                                    setOpenActionsId(null);

                                    setProcessView({
                                      invoice,
                                      student,
                                    });
                                  }}
                                >
                                  <span className="studentActionIcon">
                                    ◎
                                  </span>

                                  <span>
                                    <b>
                                      View Payment Process
                                    </b>
                                    <small>
                                      See payment and verification status
                                    </small>
                                  </span>
                                </button>
                              </>
                            )}

                            <div
                              style={{
                                height: 1,
                                margin: "7px 4px",
                                background: "#edf1f6",
                              }}
                            />

                            <div
                              style={{
                                padding: "5px 10px 6px",
                                fontSize: 10,
                                fontWeight: 900,
                                letterSpacing: ".14em",
                                color: "#8a6516",
                              }}
                            >
                              STUDENT
                            </div>

                            <button
                              type="button"
                              className="studentActionItem"
                              onClick={() => {
                                setOpenActionsId(null);
                                openEditStudent(student);
                              }}
                              disabled={
                                deletingStudent ===
                                student.id
                              }
                            >
                              <span className="studentActionIcon">
                                ✎
                              </span>

                              <span>
                                <b>Edit Student</b>
                                <small>
                                  Update student information
                                </small>
                              </span>
                            </button>

                            <button
                              type="button"
                              className="studentActionItem studentActionItemDanger"
                              onClick={() => {
                                setOpenActionsId(null);
                                void deleteStudent(student);
                              }}
                              disabled={
                                deletingStudent ===
                                student.id
                              }
                            >
                              <span className="studentActionIcon">
                                ×
                              </span>

                              <span>
                                <b>
                                  {deletingStudent ===
                                  student.id
                                    ? "Deleting…"
                                    : "Delete Student"}
                                </b>
                                <small>
                                  Remove this student and records
                                </small>
                              </span>
                            </button>

                            {invoice &&
                              invoice.status !==
                                "PAID" && (
                              <button
                                type="button"
                                className="studentActionItem studentActionItemVerify"
                                onClick={() => {
                                  setOpenActionsId(null);

                                  void approveInvoice(
                                    invoice.id
                                  );
                                }}
                              >
                                <span className="studentActionIcon">
                                  ✓
                                </span>

                                <span>
                                  <b>
                                    Manual Verify Payment
                                  </b>
                                  <small>
                                    Mark this payment as received
                                  </small>
                                </span>
                              </button>
                            )}
                            </div>,
                            document.body
                          )}
                      </div>
                    </td>
                  </tr>
    );
  }

  function renderStudentTable(
    rows: Array<{
      student: AnyRecord;
      invoice: AnyRecord | undefined;
    }>,
    emptyTitle: string
  ) {
    return (
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
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    textAlign: "center",
                    padding: "42px 20px",
                  }}
                >
                  <b>{emptyTitle}</b>
                  <div
                    className="mutedText"
                    style={{ marginTop: 6 }}
                  >
                    Try changing your search or filters.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(renderStudentRow)
            )}
          </tbody>
        </table>
      </div>
    );
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
      className="container adminDashboard"
      style={{
        padding:
          "30px 20px 80px",
      }}
    >
      <style>{`
        .studentActionItem {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 10px;
          margin: 2px 0;
          border: 0;
          border-radius: 13px;
          background: transparent;
          color: #17243a;
          text-align: left;
          cursor: pointer;
          font: inherit;
          transition:
            background .18s ease,
            transform .18s ease,
            box-shadow .18s ease;
        }

        .studentActionItem:hover:not(:disabled) {
          background: #f4f7fb;
          transform: translateX(2px);
        }

        .studentActionItem:disabled {
          opacity: .52;
          cursor: not-allowed;
        }

        .studentActionItem b {
          display: block;
          font-size: 12px;
          line-height: 1.25;
          font-weight: 850;
          color: #102b57;
        }

        .studentActionItem small {
          display: block;
          margin-top: 3px;
          color: #78879d;
          font-size: 10px;
          line-height: 1.25;
        }

        .studentActionIcon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          background: #eef3fa;
          color: #0b2a5b;
          font-size: 15px;
          font-weight: 900;
        }

        .studentActionItemPrimary .studentActionIcon {
          background: #eaf2ff;
          color: #0b2a5b;
        }

        .studentActionItemDanger:hover:not(:disabled) {
          background: #fff3f1;
        }

        .studentActionItemDanger .studentActionIcon {
          background: #fff0ef;
          color: #b42318;
        }

        .studentActionItemVerify {
          background: #fffaf0;
        }

        .studentActionItemVerify .studentActionIcon {
          background: #fff1cc;
          color: #8a5d00;
        }

        .customFeeModalField {
          min-width: 0;
        }

        .customFeeModalField label {
          display: block;
          margin-bottom: 7px;
          color: #263750;
          font-size: 12px;
          font-weight: 800;
        }

        .customFeeModalField input,
        .customFeeModalField select {
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
          transition:
            border-color .18s ease,
            box-shadow .18s ease;
        }

        .customFeeModalField input:focus,
        .customFeeModalField select:focus {
          border-color: #b98510;
          box-shadow: 0 0 0 3px rgba(185,133,16,.10);
        }

        @keyframes gpcActionPanelIn {
          from {
            opacity: 0;
            transform: translateY(-5px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .gpcStudentActionPanel {
          position: fixed !important;
          width: 300px !important;
          max-width: min(300px, calc(100vw - 24px)) !important;
          max-height: calc(100vh - 24px) !important;
          overflow-y: auto !important;
          box-sizing: border-box !important;
          transform-origin: top right;
          animation: gpcActionPanelIn .18s cubic-bezier(.2,.8,.2,1);
        }

        @media (max-width: 700px) {
          .gpcStudentActionPanel {
            max-width: calc(100vw - 24px) !important;
          }
        }
      `}</style>

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
        <div
          className="card stat statInteractive"
          role="button"
          tabIndex={0}
          onClick={() =>
            scrollToSection(studentDirectoryRef)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              scrollToSection(studentDirectoryRef);
            }
          }}
        >
          <div className="n">{counts.total}</div>
          <div className="l">Total Students</div>
          <span className="statJumpHint">
            View student directory →
          </span>
        </div>

        <div
          className="card stat statInteractive statInteractiveActive"
          role="button"
          tabIndex={0}
          onClick={() =>
            scrollToSection(activeStudentsRef)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              scrollToSection(activeStudentsRef);
            }
          }}
        >
          <div className="n">{counts.active}</div>
          <div className="l">Active Students</div>
          <span className="statJumpHint">
            Jump to active list →
          </span>
        </div>

        <div
          className="card stat statInteractive statInteractiveInactive"
          role="button"
          tabIndex={0}
          onClick={() =>
            scrollToSection(inactiveStudentsRef)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              scrollToSection(inactiveStudentsRef);
            }
          }}
        >
          <div className="n">{counts.inactive}</div>
          <div className="l">Not Active</div>
          <span className="statJumpHint">
            Jump to inactive list →
          </span>
        </div>

        <div className="card stat">
          <div className="n">{counts.received}</div>
          <div className="l">Received This Month</div>
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

      <section
        ref={studentDirectoryRef}
        className="card dashboardSection studentDirectorySection"
      >
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
              onClick={openAddStudent}
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

        <div
          ref={activeStudentsRef}
          id="active-students"
          className="studentStatusSection"
        >
          <div className="studentStatusSectionHeader">
            <div>
              <div className="eyebrow">ACTIVE STUDENTS</div>
              <h3>
                Active Students
                <span className="studentSectionCount">
                  {activeRows.length}
                </span>
              </h3>
              <p>
                Students currently active and available for normal
                monthly payment operations.
              </p>
            </div>

            <button
              type="button"
              className="sectionJumpButton"
              onClick={() =>
                scrollToSection(studentDirectoryRef)
              }
            >
              Student Directory ↑
            </button>
          </div>

          {renderStudentTable(
            activeRows,
            visibleRows.length === 0
              ? "No students found"
              : "No active students match the current filters"
          )}
        </div>

        <div
          ref={inactiveStudentsRef}
          id="inactive-students"
          className="studentStatusSection studentStatusSectionInactive"
        >
          <div className="studentStatusSectionHeader">
            <div>
              <div className="eyebrow">NOT ACTIVE STUDENTS</div>
              <h3>
                Not Active Students
                <span className="studentSectionCount studentSectionCountMuted">
                  {inactiveRows.length}
                </span>
              </h3>
              <p>
                Inactive students stay here and are separated from the
                active student workflow.
              </p>
            </div>

            <button
              type="button"
              className="sectionJumpButton"
              onClick={() =>
                scrollToSection(studentDirectoryRef)
              }
            >
              Student Directory ↑
            </button>
          </div>

          {renderStudentTable(
            inactiveRows,
            visibleRows.length === 0
              ? "No students found"
              : "No inactive students match the current filters"
          )}
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
                    {formatAmount(
                      item.currency,
                      item.total
                    )}
                  </strong>
                </div>
              )
            )}
          </div>
        </div>

        <div className="card dashboardSection receivedMoneyCard">
          <div className="sectionHeading">
            <div>
              <div className="eyebrow">
                ACTUAL PAYMENTS RECEIVED
              </div>

              <h2>
                Money Received
              </h2>

              <p className="mutedText">
                Only invoices marked RECEIVED / PAID are included.
                Amounts are kept separate by currency.
              </p>
            </div>
          </div>

          <div className="currencyList">
            {receivedCurrencyStats.map(
              (item) => (
                <div
                  className="currencyRow receivedCurrencyRow"
                  key={item.currency}
                >
                  <div>
                    <b>{item.currency}</b>
                    <div className="mutedText">
                      {item.count} received payment{item.count === 1 ? "" : "s"}
                    </div>
                  </div>

                  <strong>
                    {formatAmount(
                      item.currency,
                      item.total
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
              <h2>
                {editingStudent
                  ? "Edit Student"
                  : "Add Student"}
              </h2>
              <p>
                {editingStudent
                  ? "Update the student details below."
                  : "Enter the student details below. You can add one student or keep this form open and continue adding students."}
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
                  onClick={() => {
                    setAddStudentOpen(false);
                    setEditingStudent(null);
                  }}
                  disabled={addingStudent}
                >
                  Cancel
                </button>

                {!editingStudent && (
                  <button
                    className="btn btnPrimary"
                    onClick={() => addStudent(true)}
                    disabled={addingStudent}
                  >
                    {addingStudent
                      ? "Saving..."
                      : "Add & Add Another"}
                  </button>
                )}

                <button
                  className="btn btnGold"
                  onClick={() =>
                    editingStudent
                      ? updateStudent()
                      : addStudent(false)
                  }
                  disabled={addingStudent}
                >
                  {addingStudent
                    ? "Saving..."
                    : editingStudent
                      ? "Save Changes"
                      : "Add Student"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {customFeeStudent && (
        <div className="modalBackdrop">
          <div
            className="modal card"
            style={{
              width: "min(560px, 100%)",
              padding: 0,
              overflow: "hidden",
              borderRadius: 24,
            }}
          >
            <div
              style={{
                padding: "26px 28px 20px",
                borderBottom: "1px solid #e8edf5",
                background:
                  "linear-gradient(180deg,#fff,#fbfcff)",
              }}
            >
              <div className="eyebrow">
                CUSTOM PAYMENT
              </div>

              <h2
                style={{
                  margin: "6px 0 5px",
                }}
              >
                Create a Custom Fee
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Create a one-time payment request for{" "}
                {customFeeStudent.student_name}. This does
                not change the student’s regular monthly fee.
              </p>
            </div>

            <div style={{ padding: 24 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1fr 150px",
                  gap: 14,
                }}
              >
                <div className="customFeeModalField">
                  <label>
                    Custom Amount{" "}
                    <span className="required">
                      *
                    </span>
                  </label>

                  <input
                    autoFocus
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 200"
                    value={customFeeAmount}
                    onChange={(event) =>
                      setCustomFeeAmount(
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="customFeeModalField">
                  <label>
                    Currency{" "}
                    <span className="required">
                      *
                    </span>
                  </label>

                  <select
                    value={customFeeCurrency}
                    onChange={(event) =>
                      setCustomFeeCurrency(
                        event.target.value
                      )
                    }
                  >
                    {CURRENCIES.map((item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className="customFeeModalField"
                style={{ marginTop: 14 }}
              >
                <label>Description</label>

                <input
                  placeholder="e.g. Custom Fee, Extra Class, Balance Fee"
                  value={customFeeDescription}
                  onChange={(event) =>
                    setCustomFeeDescription(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 18,
                  padding: "15px 16px",
                  borderRadius: 16,
                  background: "#f7f9fc",
                  border:
                    "1px solid #e5ebf3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#718096",
                    }}
                  >
                    PAYMENT REQUEST
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 22,
                      fontWeight: 900,
                      color: "#0b2a5b",
                    }}
                  >
                    {customFeeCurrency}{" "}
                    {Number(
                      customFeeAmount || 0
                    ).toFixed(2)}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    textAlign: "right",
                  }}
                >
                  Student
                  <br />
                  <b
                    style={{
                      color: "#17243a",
                    }}
                  >
                    {customFeeStudent.student_name}
                  </b>
                </div>
              </div>

              {customFeeLink && (
                <div style={{ marginTop: 16 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 7,
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#263750",
                    }}
                  >
                    Secure Payment Link
                  </label>

                  <input
                    readOnly
                    value={customFeeLink}
                    onFocus={(event) =>
                      event.currentTarget.select()
                    }
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btnGhost"
                      onClick={
                        copyCustomFeeLink
                      }
                    >
                      Copy Link
                    </button>

                    <button
                      type="button"
                      className="btn btnPrimary"
                      onClick={
                        shareCustomFeeLink
                      }
                    >
                      Share Link
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className="modalActions"
              style={{
                padding: "16px 24px 22px",
                borderTop:
                  "1px solid #e8edf5",
              }}
            >
              <button
                type="button"
                className="btn btnGhost"
                onClick={closeCustomFee}
                disabled={customFeeBusy}
              >
                Close
              </button>

              <button
                type="button"
                className="btn btnGold"
                onClick={
                  createCustomFeeLink
                }
                disabled={customFeeBusy}
              >
                {customFeeBusy
                  ? "Creating…"
                  : customFeeLink
                    ? "Create New Link"
                    : "Create Payment Link"}
              </button>
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
                .status !==
                "PAID" && (
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
                  Manual Verify Payment
                </button>
              )}

              {processView.invoice
                .payment_group_id &&
                processView.invoice.status !==
                  "PAID" && (
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

            {mergePaymentLink && (
              <div
                style={{
                  marginTop: 18,
                  padding: 14,
                  borderRadius: 16,
                  background: "#f7f9fc",
                  border: "1px solid #e5ebf3",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#718096",
                    marginBottom: 7,
                  }}
                >
                  MERGED PAYMENT LINK
                </div>

                <input
                  readOnly
                  value={mergePaymentLink}
                  onFocus={(event) =>
                    event.currentTarget.select()
                  }
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: 46,
                    padding: "11px 13px",
                    border: "1px solid #dbe3ee",
                    borderRadius: 11,
                    background: "#fff",
                    color: "#12203a",
                    fontSize: 12,
                  }}
                />

                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={copyMergedPaymentLink}
                  style={{
                    width: "100%",
                    marginTop: 10,
                  }}
                >
                  Copy Merged Payment Link
                </button>
              </div>
            )}

            <div className="modalActions">
              <button
                className="btn btnGhost"
                onClick={() => {
                  const studentId =
                    merge.student?.id;

                  setMerge(null);
                  setMergePaymentLink("");

                  if (studentId) {
                    void sendLinkSeparate(
                      studentId
                    );
                  }
                }}
              >
                Send Separately
              </button>

              {!mergePaymentLink && (
                <button
                  className="btn btnGold"
                  onClick={mergeAndSend}
                  disabled={
                    sending ===
                    merge.student?.id
                  }
                >
                  {sending === merge.student?.id
                    ? "Creating…"
                    : "Merge &amp; Send One Link"}
                </button>
              )}

              {mergePaymentLink && (
                <button
                  className="btn btnGold"
                  onClick={() => {
                    setMerge(null);
                    setMergePaymentLink("");
                  }}
                >
                  Done
                </button>
              )}
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
