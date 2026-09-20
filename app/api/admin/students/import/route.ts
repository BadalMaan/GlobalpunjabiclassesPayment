import {NextResponse} from "next/server";
import {getAdminSession} from "@/lib/auth";
import Papa from "papaparse";
import {supabaseAdmin} from "@/lib/supabase";

function groupsFromRow(r: Record<string,string>) {
  const raw = r["GROUPS"] || r["groups"] || "";
  return raw.split(/[,|;]/).map(x=>x.trim()).filter(Boolean).map(x=>x.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()));
}

export async function POST(req:Request){
  const session=await getAdminSession(); if(!session) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {csv}=await req.json();
  if(!csv || typeof csv!=="string") return NextResponse.json({error:"CSV required"},{status:400});
  const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true});
  const rows=parsed.data.map(r=>({
    serial_number:Number(r["S.NUMBER"]||r["serial_number"]),
    student_name:r["STUDENT NAME"]||r["student_name"], age:r["AGE"]?Number(r["AGE"]):null,
    country:r["COUNTRY NAME"]||r["country"], timing:r["TIMING AS PER COUNTRY"]||r["timing"]||null,
    days:r["DAYS"]||r["days"]||null, monthly_fee:Number(String(r["FEE"]||r["monthly_fee"]).replace(/[^0-9.]/g,"")),
    currency:(r["CURRENCY"]||"USD").toUpperCase(), parent_name:r["PARENTS NAME"]||r["parent_name"]||null,
    parent_email:r["PARENT EMAIL"]||r["parent_email"]||null, parent_phone:r["PARENT PHONE"]||r["parent_phone"]||r["MOBILE"]||null,
    whatsapp_phone:r["WHATSAPP"]||r["whatsapp_phone"]||r["MOBILE"]||r["PARENT PHONE"]||null,
    gender:r["GENDER"]||r["gender"]||null, teacher_name:r["TEACHER"]||r["TEACHER NAME"]||r["teacher_name"]||null,
    groups:groupsFromRow(r)
  })).filter(r=>r.serial_number && r.student_name && r.country && Number.isFinite(r.monthly_fee));
  const {error}=await supabaseAdmin.from("students").upsert(rows,{onConflict:"serial_number"});
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true,count:rows.length});
}
