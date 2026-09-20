import { supabaseAdmin } from "@/lib/supabase";
import { monthLabel } from "@/lib/fees";
import { config } from "@/lib/config";
import PaymentClient from "@/components/PaymentClient";

export default async function PayPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const {data:invoice}=await supabaseAdmin.from("fee_invoices").select("*,students(*)").eq("secure_token",token).single();
  if(!invoice) return <main className="container" style={{padding:"80px 20px"}}><div className="card payCard"><h1>Payment link unavailable</h1><p>This fee link is invalid or unavailable.</p></div></main>;
  const s=invoice.students;
  return <><header className="topbar"><div className="container brand"><div className="brandMark">GPC</div><span>Global Punjabi Classes</span></div></header><main className="container" style={{padding:"40px 20px 80px"}}>
    <PaymentClient invoice={{id:invoice.id,token,studentNames:[s.student_name],month:monthLabel(invoice.fee_month),amount:String(invoice.amount),currency:invoice.currency,status:invoice.status,type:"invoice"}} config={config}/>
  </main></>;
}
