import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase";
import {razorpayFetchPayment,verifyRazorpayCheckoutSignature} from "@/lib/razorpay";
import {markInvoicePaid} from "@/lib/payment";

export async function POST(req:Request){
  try {
    const {token,razorpay_order_id,razorpay_payment_id,razorpay_signature}=await req.json();
    const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*").eq("secure_token",token).single();
    if(!invoice) return NextResponse.json({error:"Invalid link"},{status:404});
    if(invoice.razorpay_order_id!==razorpay_order_id) return NextResponse.json({error:"Order does not belong to this invoice"},{status:400});
    if(!verifyRazorpayCheckoutSignature(razorpay_order_id,razorpay_payment_id,razorpay_signature)) return NextResponse.json({error:"Invalid payment signature"},{status:401});
    const payment=await razorpayFetchPayment(razorpay_payment_id);
    if(payment.status!=="captured" || Number(payment.amount)!==Math.round(Number(invoice.amount)*100) || payment.currency!==invoice.currency) return NextResponse.json({error:"Payment verification failed"},{status:400});
    await markInvoicePaid(invoice.id,{method:"RAZORPAY",transactionId:razorpay_payment_id,providerFields:{razorpay_payment_id}});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e?.message||"Verification failed"},{status:400});}
}
