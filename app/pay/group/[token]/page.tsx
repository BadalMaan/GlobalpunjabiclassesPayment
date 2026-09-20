import { supabaseAdmin } from "@/lib/supabase";
import { monthLabel } from "@/lib/fees";
import { config } from "@/lib/config";
import PaymentClient from "@/components/PaymentClient";

export default async function GroupPayPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const {data:group}=await supabaseAdmin.from("payment_groups").select("*,payment_group_items(*,fee_invoices(*,students(*)))").eq("secure_token",token).single();
  if(!group) return <main className="container" style={{padding:"80px 20px"}}><div className="card payCard"><h1>Payment link unavailable</h1><p>This combined payment link is invalid or unavailable.</p></div></main>;
  const items=(group.payment_group_items||[]).map((x:any)=>({id:x.invoice_id,name:x.fee_invoices.students.student_name,amount:String(x.amount)}));
  return <><header className="topbar"><div className="container brand"><div className="brandMark">GPC</div><span>Global Punjabi Classes</span></div></header><main className="container" style={{padding:"40px 20px 80px"}}>
    <PaymentClient invoice={{id:group.id,token,studentNames:items.map((x:any)=>x.name),items,month:monthLabel(group.fee_month),amount:String(group.amount),currency:group.currency,status:group.status,type:"group"}} config={config}/>
  </main></>;
}
