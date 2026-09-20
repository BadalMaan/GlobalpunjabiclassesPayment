import {supabaseAdmin} from "@/lib/supabase";
import {getAdminSession} from "@/lib/auth";
import {redirect} from "next/navigation";
import {monthStart,ensureMonthInvoices} from "@/lib/fees";
import AdminClient from "@/components/AdminClient";

export default async function AdminPage(){
 const session=await getAdminSession(); if(!session) redirect("/admin/login");
 const month=monthStart();
 await ensureMonthInvoices(month);
 const {data:students}=await supabaseAdmin.from("students").select("*").order("serial_number");
 const {data:invoices}=await supabaseAdmin.from("fee_invoices").select("*,students(*)").eq("fee_month",month).order("created_at");
 return <AdminClient initialStudents={students||[]} initialInvoices={invoices||[]} month={month}/>;
}
