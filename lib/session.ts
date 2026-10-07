import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { BRAND } from "@/lib/brand";

// Two signed cookies, never interchangeable (different audiences); names come from lib/brand.ts:
// - session { uid, hid }: a real sign-in. hid is null until the user has a household.
// - demo    { demo: true }: the /demo visitor. Only consulted when there is no session.

export const SESSION_COOKIE = BRAND.cookies.session;
export const DEMO_COOKIE = BRAND.cookies.demo;
const SESSION_DAYS = 30;
export const DEMO_DAYS = 7;
/** proxy.ts re-issues the session cookie once it is this old (sliding 30-day session). */
export const RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

/**
 * APP_DEV_USER + APP_DEV_HOUSEHOLD sign every request in as that email in that household.
 * Never in production, whatever the env says.
 */
export function devBypass(): { email: string; slug: string } | null {
  const email = process.env.APP_DEV_USER;
  const slug = process.env.APP_DEV_HOUSEHOLD;
  if (process.env.VERCEL_ENV === "production" || !email || !slug) return null;
  return { email, slug };
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface Session {
  uid: number;
  hid: number | null;
  issuedAt: number; // unix seconds, for sliding renewal
}

export async function createSessionToken(uid: number, hid: number | null): Promise<string> {
  return new SignJWT({ uid, hid })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "session" });
    const { uid, hid, iat } = payload;
    if (!Number.isInteger(uid) || !(hid === null || Number.isInteger(hid))) return null;
    return { uid: uid as number, hid: hid as number | null, issuedAt: iat ?? 0 };
  } catch {
    return null;
  }
}

export async function createDemoToken(): Promise<string> {
  return new SignJWT({ demo: true })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("demo")
    .setIssuedAt()
    .setExpirationTime(`${DEMO_DAYS}d`)
    .sign(secretKey());
}

export async function readDemoToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "demo" });
    return payload.demo === true;
  } catch {
    return false;
  }
}

export function cookieOptions(days = SESSION_DAYS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  };
}

/** The signed-in session from the request cookie (server components, actions, routes). */
export async function getSession(): Promise<Session | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function hasDemoCookie(): Promise<boolean> {
  return readDemoToken((await cookies()).get(DEMO_COOKIE)?.value);
}

/** Server actions and route handlers only (cookies cannot be set while rendering). */
export async function startSession(uid: number, hid: number | null): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(uid, hid), cookieOptions());
  jar.delete(DEMO_COOKIE);
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function startDemo(): Promise<void> {
  (await cookies()).set(DEMO_COOKIE, await createDemoToken(), cookieOptions(DEMO_DAYS));
}
