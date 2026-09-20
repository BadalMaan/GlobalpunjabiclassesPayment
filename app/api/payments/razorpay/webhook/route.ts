import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase";
import {verifyRazorpayWebhook} from "@/lib/razorpay";
import {logPaymentEvent,markInvoicePaid,markGroupPaid} from "@/lib/payment";

export async function POST(req:Request){
  const raw=await req.text();
  const signature=req.headers.get("x-razorpay-signature");
  if(!verifyRazorpayWebhook(raw,signature)) return NextResponse.json({error:"Invalid signature"},{status:401});
  let body:any; try{body=JSON.parse(raw)}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const eventId=req.headers.get("x-razorpay-event-id")||body.id||null;
  const payment=body?.payload?.payment?.entity;
  const order=body?.payload?.order?.entity;
  const orderId=payment?.order_id||order?.id;
  let invoiceId:string|null=null; let groupId:string|null=null;
  if(orderId){const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("id,razorpay_order_id").eq("razorpay_order_id",orderId).maybeSingle();invoiceId=invoice?.id||null; if(!invoiceId){const {data:group}=await supabaseAdmin.from("payment_groups").select("id,razorpay_order_id").eq("razorpay_order_id",orderId).maybeSingle();groupId=group?.id||null;}}
  const inserted=await logPaymentEvent(invoiceId,"RAZORPAY",eventId,body.event||body.type||"unknown",body);
  if(!inserted) return NextResponse.json({received:true,duplicate:true});
  if((body.event==="payment.captured"||body.event==="order.paid")&&groupId&&payment?.status==="captured") {
    const {data:g}=await supabaseAdmin.from("payment_groups").select("*").eq("id",groupId).single();
    if(g && Number(payment.amount)===Math.round(Number(g.amount)*100) && payment.currency===g.currency) await markGroupPaid(g.id,{method:"RAZORPAY",transactionId:payment.id,providerFields:{razorpay_payment_id:payment.id}});
  }
  if((body.event==="payment.captured"||body.event==="order.paid")&&invoiceId&&payment?.status==="captured"){
    const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*").eq("id",invoiceId).single();
    if(invoice && Number(payment.amount)===Math.round(Number(invoice.amount)*100) && payment.currency===invoice.currency){
      await markInvoicePaid(invoice.id,{method:"RAZORPAY",transactionId:payment.id,providerFields:{razorpay_payment_id:payment.id}});
    }
  }
  return NextResponse.json({received:true});
}
