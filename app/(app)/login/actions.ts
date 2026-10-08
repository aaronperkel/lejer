"use server";

import { createElement } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import LoginCode from "@/emails/LoginCode";
import { homePath } from "@/lib/context";
import { withHousehold, withUser } from "@/lib/db";
import { safeNext } from "@/lib/flash";
import { getUserByEmail, markJoined } from "@/lib/households";
import { createLoginCode, deleteLoginCode, hashIp, normalizeEmail, verifyLoginCode } from "@/lib/login-codes";
import { sendMail } from "@/lib/mail";
import { householdPath } from "@/lib/paths";
import { endSession, startSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { BRAND } from "@/lib/brand";

function loginUrl(params: Record<string, string>): string {
  if (params.next === "/") delete params.next;
  return `/login?${new URLSearchParams(params)}`;
}

/** "jo.smith+bills@x.com" → "Jo": a stand-in until the wizard (or /account) asks. */
function placeholderName(email: string): string {
  const word = email.split("@")[0].split("+")[0].split(/[._-]+/).find(Boolean) ?? "there";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Step 1: email a one-time code. Unknown addresses get one too (anyone can sign up). */
export async function requestCode(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  const raw = String(formData.get("email") ?? "").trim();
  const email = normalizeEmail(raw);
  if (!email) redirect(loginUrl({ err: "bad-email", email: raw, next }));

  const ipHash = hashIp((await headers()).get("x-forwarded-for"));
  const { created, name } = await withUser(null, async (tx) => ({
    created: await createLoginCode(tx, email, ipHash),
    name: (await getUserByEmail(tx, email))?.name ?? null,
  }));
  if (created.kind === "rate-limited" || created.kind === "daily-cap") {
    redirect(loginUrl({ err: created.kind, email, next }));
  }

  if (created.kind === "created") {
    const sent = await sendMail({
      to: email,
      subject: `${created.code} is your ${BRAND.name} sign-in code`,
      react: createElement(LoginCode, { code: created.code, name }),
      kind: "login_code",
    });
    if (!sent) {
      await withUser(null, (tx) => deleteLoginCode(tx, created.id));
      redirect(loginUrl({ err: "send-failed", email, next }));
    }
  }
  // "recent" falls through: a code sent seconds ago answers this request too.
  redirect(loginUrl({ step: "code", email, next }));
}

/** Step 2: check the code, create the user if new, accept pending invites, start a session. */
export async function submitCode(formData: FormData): Promise<void> {
  const next = safeNext(formData.get("next"));
  const email = normalizeEmail(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!email) redirect(loginUrl({ err: "bad-email", next }));

  const result: User | "bad" | "expired" = await withUser(null, async (tx) => {
    const check = await verifyLoginCode(tx, email, code);
    if (check !== "ok") return check;
    await tx`INSERT INTO users (email, name) VALUES (${email}, ${placeholderName(email)})
             ON CONFLICT (email) DO NOTHING`;
    return (await getUserByEmail(tx, email))!;
  });
  if (result === "bad") redirect(loginUrl({ err: "bad-code", step: "code", email, next }));
  if (result === "expired") redirect(loginUrl({ err: "expired", email, next }));
  const user = result;

  // Signing in accepts every pending invite. memberships_write only admits the current
  // household, so each stamp runs in that household's own transaction.
  const memberships = await withUser(user.id, (tx) => tx<{ id: number; householdId: number; slug: string; joinedAt: Date | null }[]>`
    SELECT m.id, m.household_id AS "householdId", h.slug, m.joined_at AS "joinedAt"
    FROM memberships m JOIN households h ON h.id = m.household_id
    WHERE m.user_id = ${user.id} ORDER BY m.id`);
  const pending = memberships.filter((m) => !m.joinedAt);
  for (const m of pending) {
    await withHousehold({ household: { id: m.householdId }, user }, (tx) => markJoined(tx, m.id));
  }

  await startSession(user.id);
  if (memberships.length === 0) redirect("/new");
  if (next !== "/") redirect(next);
  // Otherwise the newest invite if there is one, else the household opened last (homePath).
  const invited = pending.at(-1);
  redirect(invited ? householdPath({ slug: invited.slug }) : await homePath(user));
}

/** Back to the public site, signed out. */
export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}
