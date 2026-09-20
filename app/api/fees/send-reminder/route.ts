import {NextResponse} from "next/server";
import {getAdminSession} from "@/lib/auth";
import {supabaseAdmin} from "@/lib/supabase";
import {feeEmail,sendEmail} from "@/lib/email";
import {monthLabel} from "@/lib/fees";
export async function POST(req:Request){const session=await getAdminSession();if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});const {invoiceId}=await req.json();const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*,students(*)").eq("id",invoiceId).single();if(!invoice?.students?.parent_email)return NextResponse.json({error:"Parent email missing"},{status:400});const payUrl=`${process.env.NEXT_PUBLIC_SITE_URL}/pay/${invoice.secure_token}`;await sendEmail({to:invoice.students.parent_email,subject:`Monthly fee payment — ${invoice.students.student_name} — ${monthLabel(invoice.fee_month)}`,html:feeEmail({studentNames:[invoice.students.student_name],month:monthLabel(invoice.fee_month),amount:String(invoice.amount),currency:invoice.currency,payUrl})});return NextResponse.json({ok:true});}
