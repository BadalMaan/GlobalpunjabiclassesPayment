import { supabaseAdmin } from "./supabase";

export function monthStart(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0,10);
}

export function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(date));
}

export async function ensureInvoice(studentId: string, feeMonth: string) {
  const { data: student, error: se } = await supabaseAdmin.from("students").select("*").eq("id", studentId).single();
  if (se || !student) throw new Error("Student not found");
  const { data: existing } = await supabaseAdmin.from("fee_invoices").select("*").eq("student_id", studentId).eq("fee_month", feeMonth).maybeSingle();
  if (existing) return { invoice: existing, student };
  const invoiceNumber = `GPC-${feeMonth.slice(0,7).replace("-","")}-${String(student.serial_number).padStart(4,"0")}`;
  const { data: invoice, error } = await supabaseAdmin.from("fee_invoices").insert({student_id:studentId,fee_month:feeMonth,amount:student.monthly_fee,currency:student.currency,invoice_number:invoiceNumber}).select("*").single();
  if (error) throw error;
  return { invoice, student };
}

export async function ensureMonthInvoices(feeMonth: string) {
  const {data: students, error} = await supabaseAdmin.from("students").select("*").eq("active",true).order("serial_number");
  if (error) throw error;
  for (const student of students || []) await ensureInvoice(student.id, feeMonth);
  return students || [];
}
