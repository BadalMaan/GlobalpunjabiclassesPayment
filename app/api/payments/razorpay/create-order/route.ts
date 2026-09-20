import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase";
import {razorpayCreateOrder} from "@/lib/razorpay";

export async function POST(req:Request){
  try {
    const {token}=await req.json();
    const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*,students(*)").eq("secure_token",token).single();
    if(!invoice) return NextResponse.json({error:"Invalid link"},{status:404});
    if(invoice.status==="PAID") return NextResponse.json({error:"Already paid"},{status:409});
    if(invoice.currency!=="INR") return NextResponse.json({error:"Razorpay checkout is currently configured for INR invoices. Enable approved international payments and add the corresponding currency configuration before using Razorpay for foreign-currency invoices."},{status:400});
    const order=await razorpayCreateOrder({amountMinor:Math.round(Number(invoice.amount)*100),currency:invoice.currency,receipt:invoice.invoice_number,notes:{invoice_id:invoice.id,student_id:invoice.student_id}});
    await supabaseAdmin.from("fee_invoices").update({razorpay_order_id:order.id,status:"PROCESSING",payment_method:"RAZORPAY"}).eq("id",invoice.id);
    return NextResponse.json({key:process.env.RAZORPAY_KEY_ID,orderId:order.id,amount:order.amount,currency:order.currency});
  } catch(e:any){return NextResponse.json({error:e?.message||"Could not create Razorpay order"},{status:400});}
}
