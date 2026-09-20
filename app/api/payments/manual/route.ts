import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase";
import {getAdminSession} from "@/lib/auth";
import {PAYMENT_METHODS} from "@/lib/payment";

const manual = new Set(["WISE","PAYONEER","REMITLY","BANK_TRANSFER","UPI"]);
export async function POST(req:Request){
  const body=await req.json();
  if(!body.token || !manual.has(body.method) || !body.reference?.trim()) return NextResponse.json({error:"Payment method and reference are required"},{status:400});
  const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("id,status").eq("secure_token",body.token).single();
  if(!invoice) return NextResponse.json({error:"Invalid link"},{status:404});
  if(invoice.status==="PAID") return NextResponse.json({ok:true});
  const {error}=await supabaseAdmin.from("fee_invoices").update({status:"VERIFYING",payment_method:body.method,payment_reference:body.reference.trim()}).eq("id",invoice.id);
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true});
}
