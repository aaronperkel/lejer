// One-time email login codes (login_codes, keyed by normalized email). A code is a 6-digit
// number hashed at rest, valid for 10 minutes, dead after 5 wrong guesses, deleted on success.
// Requesting a code never touches users: the row is created when a code verifies.
//
// Abuse controls (the app is public): per email 5 per 10 min with a 30 s burst dedupe, per IP
// 10 per hour (sha256 of the first x-forwarded-for hop), and 40 login-code emails per UTC day
// account-wide, which keeps ~60% of Resend's 100/day for household mail.
// All functions run inside withUser(null): login_codes and users have no RLS.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Tx } from "@/lib/db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_EMAIL = 5; // per CODE_TTL_MINUTES window
const DEDUPE_SECONDS = 30;
const MAX_CODES_PER_IP_HOUR = 10;
export const MAX_LOGIN_EMAILS_PER_DAY = 40;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The one spelling of an address: trimmed, lowercased, plausibly an email, ≤ 254 chars. */
export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** sha256 of the client IP (first x-forwarded-for hop); never stored raw. */
export function hashIp(forwardedFor: string | null): string | null {
  const ip = forwardedFor?.split(",")[0]?.trim();
  return ip ? sha256(ip) : null;
}

export type CreateCodeResult =
  | { kind: "created"; code: string; id: number }
  | { kind: "recent" } // a live code was minted seconds ago: it answers this request too
  | { kind: "rate-limited" } // this email or this IP asked too often
  | { kind: "daily-cap" }; // the account-wide login-code budget for today is spent

export async function createLoginCode(tx: Tx, email: string, ipHash: string | null): Promise<CreateCodeResult> {
  const [counts] = await tx<{ windowCount: number; burstCount: number; ipCount: number; todayCount: number }[]>`
    SELECT
      count(*) FILTER (WHERE email = ${email} AND created_at > now() - make_interval(mins => ${CODE_TTL_MINUTES}))
        AS "windowCount",
      count(*) FILTER (WHERE email = ${email} AND created_at > now() - make_interval(secs => ${DEDUPE_SECONDS})
                       AND attempts < ${MAX_ATTEMPTS}) AS "burstCount",
      count(*) FILTER (WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour') AS "ipCount",
      email_sends_since(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 'login_code')
        AS "todayCount"
    FROM login_codes
    WHERE created_at > now() - interval '1 hour'`;

  // Double-taps on a slow submit used to mint one code per tap and exhaust the window.
  if (counts.burstCount > 0) return { kind: "recent" };
  if (counts.windowCount >= MAX_CODES_PER_EMAIL || counts.ipCount >= MAX_CODES_PER_IP_HOUR) {
    return { kind: "rate-limited" };
  }
  if (counts.todayCount >= MAX_LOGIN_EMAILS_PER_DAY) {
    console.warn(`[login] daily login-code cap (${MAX_LOGIN_EMAILS_PER_DAY}) reached; refusing a code`);
    return { kind: "daily-cap" };
  }

  // Opportunistic cleanup; the hour of grace keeps the per-IP window honest.
  await tx`DELETE FROM login_codes WHERE expires_at < now() - interval '1 hour'`;

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [row] = await tx<{ id: number }[]>`
    INSERT INTO login_codes (email, code_hash, ip_hash, expires_at)
    VALUES (${email}, ${sha256(code)}, ${ipHash}, now() + make_interval(mins => ${CODE_TTL_MINUTES}))
    RETURNING id`;
  return { kind: "created", code, id: row.id };
}

/** Release a code that never reached its inbox, so it doesn't count against the window. */
export async function deleteLoginCode(tx: Tx, id: number): Promise<void> {
  await tx`DELETE FROM login_codes WHERE id = ${id}`;
}

export type CodeCheck = "ok" | "bad" | "expired";

/**
 * Check a submitted code against the email's newest live one. "expired" also covers
 * never-requested and attempt-exhausted codes: every case where the fix is a fresh code.
 */
export async function verifyLoginCode(tx: Tx, email: string, code: string): Promise<CodeCheck> {
  const [row] = await tx<{ id: number; codeHash: string; attempts: number }[]>`
    SELECT id, code_hash AS "codeHash", attempts FROM login_codes
    WHERE email = ${email} AND expires_at > now()
    ORDER BY id DESC LIMIT 1
    FOR UPDATE`;
  if (!row || row.attempts >= MAX_ATTEMPTS) return "expired";

  const submitted = Buffer.from(sha256(code), "hex");
  const stored = Buffer.from(row.codeHash, "hex");
  if (/^\d{6}$/.test(code) && timingSafeEqual(submitted, stored)) {
    await tx`DELETE FROM login_codes WHERE email = ${email}`;
    return "ok";
  }
  await tx`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
  return "bad";
}
