import { createHash } from "node:crypto";
import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { withHousehold, withUser, type TenantScope } from "@/lib/db";
import type { Household } from "@/lib/types";

// Every outbound email goes through sendMail(). It returns false on failure (logged, never
// thrown) and writes one email_log row per attempt, the source of truth for Resend's
// 100/day budget. Two dev affordances, both impossible in production (VERCEL_ENV):
// - RESEND_API_KEY empty → "console mode": the message is printed with a [mail:console]
//   prefix instead of sent, and no email_log row is written. instrumentation.ts refuses to
//   boot production without a key, so codes can never land in production logs.
// - RESEND_TEST_SENDER=1 → From becomes onboarding@resend.dev (display name kept), for use
//   until mail.lejer.app verifies. Resend only delivers that sender's mail to the Resend
//   account's own address.

export type MailKind = "login_code" | "invite";

/** Kinds sent as "Lejer" <login@…> with no Reply-To; everything else is household mail. */
const ACCOUNT_KINDS: ReadonlySet<MailKind> = new Set(["login_code", "invite"]);

const isProduction = () => process.env.VERCEL_ENV === "production";

export function consoleMode(): boolean {
  return !process.env.RESEND_API_KEY && !isProduction();
}

let client: Resend | undefined;
function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client ??= new Resend(key));
}

function fromHeader(kind: MailKind, household?: Pick<Household, "name" | "fromName">): string {
  const test = process.env.RESEND_TEST_SENDER === "1" && !isProduction();
  if (ACCOUNT_KINDS.has(kind)) {
    return `Lejer <${test ? "onboarding@resend.dev" : "login@mail.lejer.app"}>`;
  }
  if (!household) throw new Error(`household mail (${kind}) needs a household`);
  // Display names can't carry quotes or angle brackets unescaped; strip them.
  const name = `${household.fromName || household.name} via Lejer`.replace(/["<>\\]/g, "");
  return `"${name}" <${test ? "onboarding@resend.dev" : "notify@mail.lejer.app"}>`;
}

export interface SendMailArgs {
  /** The household the mail is about (logs under it; names the From for household mail). */
  ctx?: TenantScope & { household: Pick<Household, "id" | "name" | "fromName" | "replyTo"> };
  to: string;
  subject: string;
  react: ReactElement;
  kind: MailKind;
  /** Household mail only. Defaults to households.reply_to; reminders pass the bill owner. */
  replyTo?: string | null;
}

export async function sendMail({ ctx, to, subject, react, kind, replyTo }: SendMailArgs): Promise<boolean> {
  const text = await render(react, { plainText: true });

  if (consoleMode()) {
    console.log(`[mail:console] ${kind} to ${to}: ${subject}\n${text}\n[mail:console] end`);
    return true;
  }

  let ok = false;
  try {
    const html = await render(react);
    const reply = ACCOUNT_KINDS.has(kind) ? undefined : (replyTo ?? ctx?.household.replyTo ?? undefined);
    const { error } = await resend().emails.send({
      from: fromHeader(kind, ctx?.household),
      to,
      subject,
      html,
      text,
      ...(reply ? { replyTo: reply } : {}),
    });
    if (error) console.error(`sendMail(${kind}) failed for ${to}: ${error.name}: ${error.message}`);
    ok = !error;
  } catch (err) {
    console.error(`sendMail(${kind}) failed for ${to}:`, err);
  }

  // No RETURNING: a NULL-household row would have to pass email_log's SELECT policy, and fails.
  const toHash = createHash("sha256").update(to.trim().toLowerCase()).digest("hex");
  try {
    if (ctx) {
      await withHousehold(ctx, (tx) => tx`
        INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (${ctx.household.id}, ${kind}, ${toHash}, ${ok})`);
    } else {
      await withUser(null, (tx) => tx`
        INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (NULL, ${kind}, ${toHash}, ${ok})`);
    }
  } catch (err) {
    console.error(`email_log insert failed (${kind}):`, err);
  }
  return ok;
}
