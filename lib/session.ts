import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { BRAND } from "@/lib/brand";

// The session cookie is identity only: { uid }, signed, audience "session". Which household a
// page shows comes from its URL (lib/paths.ts), never from the cookie. Names come from
// lib/brand.ts. Tokens issued before households had URLs also carry a hid; it is ignored.

export const SESSION_COOKIE = BRAND.cookies.session;
/** The slug of the household last opened, set by proxy.ts. A preference, not a credential. */
export const HOUSEHOLD_COOKIE = BRAND.cookies.household;
const SESSION_DAYS = 30;
/** proxy.ts re-issues the session cookie once it is this old (sliding 30-day session). */
export const RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

/**
 * APP_DEV_USER signs every request in as that email; APP_DEV_HOUSEHOLD (a slug) is where
 * "Sign in" lands. Both must be set. Never in production, whatever the env says.
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
  issuedAt: number; // unix seconds, for sliding renewal
}

export async function createSessionToken(uid: number): Promise<string> {
  return new SignJWT({ uid })
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
    const { uid, iat } = payload;
    if (!Number.isInteger(uid)) return null;
    return { uid: uid as number, issuedAt: iat ?? 0 };
  } catch {
    return null;
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

/** Server actions and route handlers only (cookies cannot be set while rendering). */
export async function startSession(uid: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(uid), cookieOptions());
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(HOUSEHOLD_COOKIE);
}
