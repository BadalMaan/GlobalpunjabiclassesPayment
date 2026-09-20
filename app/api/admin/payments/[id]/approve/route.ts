import {NextResponse} from "next/server";
import {getAdminSession} from "@/lib/auth";
import {supabaseAdmin} from "@/lib/supabase";
import {markInvoicePaid} from "@/lib/payment";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getAdminSession(); if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params; const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*").eq("id",id).single();
 if(!invoice)return NextResponse.json({error:"Not found"},{status:404});
 try{await markInvoicePaid(invoice.id,{method:(invoice.payment_method||"BANK_TRANSFER") as any,transactionId:invoice.payment_reference||null,actor:String(session.email||"admin")});return NextResponse.json({ok:true});}
 catch(e:any){return NextResponse.json({error:e?.message||"Could not verify"},{status:400});}
}
