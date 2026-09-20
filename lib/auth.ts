import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

function getSecret() {
  const raw = process.env.ADMIN_JWT_SECRET;
  if (!raw || raw.length < 32) throw new Error("ADMIN_JWT_SECRET must be set to a long random secret");
  return new TextEncoder().encode(raw);
}

export async function createAdminSession(email:string) {
  const token = await new SignJWT({email,role:"owner"}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("8h").sign(getSecret());
  (await cookies()).set("gpc_admin",token,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:28800});
}

export async function getAdminSession() {
  const token=(await cookies()).get("gpc_admin")?.value;
  if(!token) return null;
  try { const {payload}=await jwtVerify(token,getSecret()); return payload; } catch { return null; }
}
