 "use client";
import {useState} from "react";
export default function Login(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");
 async function submit(e:any){e.preventDefault();setError("");const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});if(r.ok)location.href="/admin";else setError("Invalid email or password");}
 return <main className="container" style={{padding:"80px 20px"}}><form className="card payCard" onSubmit={submit}><div style={{color:"#d69a1d",fontWeight:800,letterSpacing:2,fontSize:12}}>PRIVATE OPERATOR AREA</div><h1>Operator Login</h1><p style={{color:"#64748b"}}>Sign in to manage fees and payments.</p>{error&&<div className="notice" style={{color:"#991b1b"}}>{error}</div>}<input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{width:"100%",padding:14,margin:"12px 0",borderRadius:12,border:"1px solid #dbe3ee"}}/><input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",padding:14,margin:"12px 0",borderRadius:12,border:"1px solid #dbe3ee"}}/><button className="btn btnPrimary" style={{width:"100%"}}>Sign in securely</button></form></main>
}
