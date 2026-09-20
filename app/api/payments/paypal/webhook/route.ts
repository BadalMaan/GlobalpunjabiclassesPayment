import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabase";
import {paypalVerifyWebhook} from "@/lib/paypal";
import {logPaymentEvent,markInvoicePaid,markGroupPaid} from "@/lib/payment";

export async function POST(req:Request){
  const raw=await req.text(); let body:any; try{body=JSON.parse(raw)}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const headers={
    "paypal-auth-algo":req.headers.get("paypal-auth-algo")||"", "paypal-cert-url":req.headers.get("paypal-cert-url")||"",
    "paypal-transmission-id":req.headers.get("paypal-transmission-id")||"", "paypal-transmission-sig":req.headers.get("paypal-transmission-sig")||"", "paypal-transmission-time":req.headers.get("paypal-transmission-time")||""
  };
  const valid=await paypalVerifyWebhook(headers,body); if(!valid)return NextResponse.json({error:"Invalid signature"},{status:401});
  const eventId=body.id||null; const inserted=await logPaymentEvent(null,"PAYPAL",eventId,body.event_type||"unknown",body); if(!inserted)return NextResponse.json({received:true,duplicate:true});
  if(body.event_type==="PAYMENT.CAPTURE.COMPLETED"){
    const capture=body.resource; const orderId=capture?.supplementary_data?.related_ids?.order_id;
    if(orderId){
      const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*").eq("paypal_order_id",orderId).maybeSingle();
      if(invoice && String(capture.amount?.value)===Number(invoice.amount).toFixed(2) && capture.amount?.currency_code===invoice.currency) await markInvoicePaid(invoice.id,{method:"PAYPAL",transactionId:capture.id,providerFields:{paypal_capture_id:capture.id}});
      else if(!invoice){const {data:g}=await supabaseAdmin.from("payment_groups").select("*").eq("paypal_order_id",orderId).maybeSingle();if(g&&String(capture.amount?.value)===Number(g.amount).toFixed(2)&&capture.amount?.currency_code===g.currency)await markGroupPaid(g.id,{method:"PAYPAL",transactionId:capture.id,providerFields:{paypal_capture_id:capture.id}});}
    }
  }
  return NextResponse.json({received:true});
}
