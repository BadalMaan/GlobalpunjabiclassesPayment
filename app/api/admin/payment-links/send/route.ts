import {NextResponse} from "next/server";
import {getAdminSession} from "@/lib/auth";
import {supabaseAdmin} from "@/lib/supabase";
import {ensureInvoice, monthLabel, monthStart} from "@/lib/fees";
import {feeEmail, sendEmail} from "@/lib/email";
import {sendWhatsAppPaymentLink} from "@/lib/whatsapp";
import {normalizeEmail, normalizePhone, logAudit} from "@/lib/payment";

async function matchingStudents(student:any) {
  const email = normalizeEmail(student.parent_email);
  const phone = normalizePhone(student.whatsapp_phone || student.parent_phone);
  if (!email && !phone) return [];
  const {data: all} = await supabaseAdmin.from("students").select("*").eq("active",true).order("serial_number");
  return (all || []).filter((s:any) => {
    const sameEmail = email && normalizeEmail(s.parent_email) === email;
    const samePhone = phone && normalizePhone(s.whatsapp_phone || s.parent_phone) === phone;
    return (sameEmail || samePhone) && s.id !== student.id;
  });
}

async function sendForStudents(students:any[], feeMonth:string, actor:string) {
  if (!students.length) throw new Error("No students selected");
  const currencies = new Set(students.map(s=>String(s.currency).toUpperCase()));
  if (currencies.size !== 1) throw new Error("Students with different currencies cannot be merged into one payment link");

  const prepared = [];
  for (const s of students) prepared.push(await ensureInvoice(s.id, feeMonth));
  const currency = prepared[0].invoice.currency;
  const total = prepared.reduce((sum,x)=>sum+Number(x.invoice.amount),0).toFixed(2);
  const sameEmail = students.map(s=>normalizeEmail(s.parent_email)).find(Boolean) || "";
  const samePhone = students.map(s=>normalizePhone(s.whatsapp_phone || s.parent_phone)).find(Boolean) || "";
  const names = students.map(s=>s.student_name);

  let paymentUrl = "";
  let groupId: string | null = null;
  if (prepared.length === 1) {
    paymentUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/pay/${prepared[0].invoice.secure_token}`;
  } else {
    const invoiceNumber = `GPC-${feeMonth.slice(0,7).replace("-","")}-GRP-${Date.now().toString().slice(-6)}`;
    const {data:group,error:ge} = await supabaseAdmin.from("payment_groups").insert({fee_month:feeMonth,amount:Number(total),currency,invoice_number:invoiceNumber}).select("*").single();
    if (ge || !group) throw ge || new Error("Could not create payment group");
    groupId = group.id;
    const items = prepared.map(x=>({payment_group_id:group.id,invoice_id:x.invoice.id,amount:x.invoice.amount}));
    const {error:ie}=await supabaseAdmin.from("payment_group_items").insert(items);
    if (ie) throw ie;
    paymentUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/pay/group/${group.secure_token}`;
    await logAudit("PAYMENT_LINK_MERGED", "payment_group", group.id, actor, {studentIds:students.map(s=>s.id),total,currency});
  }

  if (!sameEmail && !samePhone) throw new Error("No parent email or WhatsApp number is available");
  if (sameEmail) {
    await sendEmail({to:sameEmail,subject:`Monthly fee payment — ${names.join(" & ")} — ${monthLabel(feeMonth)}`,html:feeEmail({studentNames:names,month:monthLabel(feeMonth),amount:total,currency,payUrl:paymentUrl})});
    await supabaseAdmin.from("message_log").insert({student_id:students.length===1?students[0].id:null,payment_group_id:groupId,channel:"EMAIL",destination:sameEmail,status:"SENT"});
  }
  let whatsapp:any = {ok:false,skipped:true,reason:"No WhatsApp number"};
  if (samePhone) whatsapp = await sendWhatsAppPaymentLink({to:samePhone,studentNames:names,total,currency,feeMonth:monthLabel(feeMonth),paymentUrl,logStudentId:students.length===1?students[0].id:null,paymentGroupId:groupId});

  return {paymentUrl,groupId,studentIds:students.map(s=>s.id),total,currency,emailSent:Boolean(sameEmail),whatsapp};
}

export async function POST(req:Request){
  const session=await getAdminSession(); if(!session) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json();
  const feeMonth=monthStart(body.month);
  const {data:student}=await supabaseAdmin.from("students").select("*").eq("id",body.studentId).single();
  if(!student) return NextResponse.json({error:"Student not found"},{status:404});

  const matches=await matchingStudents(student);
  if(!body.forceSeparate && !body.mergeConfirmed && matches.length) {
    return NextResponse.json({needsMergeDecision:true,student:{id:student.id,name:student.student_name,email:student.parent_email,phone:student.whatsapp_phone||student.parent_phone},matches:matches.map((s:any)=>({id:s.id,name:s.student_name,age:s.age,country:s.country,currency:s.currency,fee:s.monthly_fee,email:s.parent_email,phone:s.whatsapp_phone||s.parent_phone}))});
  }
  let selected=[student];
  if(body.mergeConfirmed){
    const ids=Array.from(new Set([student.id,...(Array.isArray(body.studentIds)?body.studentIds:[])]));
    const {data:rows}=await supabaseAdmin.from("students").select("*").in("id",ids);
    selected=rows||[];
  }
  try { return NextResponse.json({ok:true,...await sendForStudents(selected,feeMonth,String(session.email||"admin"))}); }
  catch(e:any){ return NextResponse.json({error:e?.message||"Could not send payment link"},{status:400}); }
}
