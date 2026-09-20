import Link from "next/link";
export default function Home(){
 return <><header className="topbar"><div className="container brand"><div className="brandMark">GPC</div><span>Global Punjabi Classes</span></div></header>
 <main className="container hero"><div className="card" style={{padding:40}}>
 <div style={{color:"#d69a1d",fontWeight:800,letterSpacing:2,fontSize:12}}>WELCOME</div>
 <h1>Simple. Secure. <span style={{color:"#d69a1d"}}>Smooth.</span></h1>
 <p>Your monthly fee payment portal. Parents open the private payment link from their fee email, choose a payment method, and receive their receipt after payment is confirmed.</p>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
   <Link className="btn btnPrimary" href="/admin">Operator Dashboard</Link>
 </div>
 </div></main></>
}
