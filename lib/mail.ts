import { createHash } from "node:crypto";
import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { type TenantScope, type Tx, withHousehold, withUser } from "@/lib/db";
import type { Household } from "@/lib/types";
import { BRAND } from "@/lib/brand";

// Every outbound email goes through sendMail(). It returns false on failure (logged, never
// thrown) and writes one email_log row per attempt, the source of truth for Resend's
// 100/day budget. Two dev affordances, both impossible in production (VERCEL_ENV):
// - RESEND_API_KEY empty → "console mode": the message is printed with a [mail:console]
//   prefix instead of sent, and no email_log row is written. instrumentation.ts refuses to
//   boot production without a key, so codes can never land in production logs.
// - RESEND_TEST_SENDER=1 → From becomes onboarding@resend.dev (display name kept), for use
//   until the mail domain (BRAND.mailDomain) verifies. Resend only delivers that sender's mail to the Resend
//   account's own address.

export type MailKind =
  | "login_code"
  | "invite"
  | "new_bill"
  | "bill_updated"
  | "bill_removed"
  | "reminder"
  | "thanks"
  | "custom"
  | "batch_confirmation"
  | "bulk_receipt"
  | "digest";

/** Kinds sent as "{BRAND.name}" <login@…> with no Reply-To; everything else is household mail. */
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
    return `${BRAND.name} <${test ? "onboarding@resend.dev" : BRAND.loginFrom}>`;
  }
  if (!household) throw new Error(`household mail (${kind}) needs a household`);
  // Display names can't carry quotes or angle brackets unescaped; strip them.
  const name = `${household.fromName || household.name} via ${BRAND.name}`.replace(/["<>\\]/g, "");
  return `"${name}" <${test ? "onboarding@resend.dev" : BRAND.notifyFrom}>`;
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

type HouseholdScope = NonNullable<SendMailArgs["ctx"]>;

interface Rendered {
  args: SendMailArgs;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
}

async function prepare(args: SendMailArgs): Promise<Rendered> {
  const text = await render(args.react, { plainText: true });
  if (consoleMode()) return { args, html: "", text, from: "" };
  const reply = ACCOUNT_KINDS.has(args.kind) ? undefined : (args.replyTo ?? args.ctx?.household.replyTo ?? undefined);
  return { args, html: await render(args.react), text, from: fromHeader(args.kind, args.ctx?.household), ...(reply ? { replyTo: reply } : {}) };
}

function printConsole({ args, text }: Rendered): void {
  console.log(`[mail:console] ${args.kind} to ${args.to}: ${args.subject}\n${text}\n[mail:console] end`);
}

const hashTo = (to: string) => createHash("sha256").update(to.trim().toLowerCase()).digest("hex");

/** One email_log row per attempt, in its own short transaction, never RETURNING (see below). */
async function log(ctx: HouseholdScope | undefined, attempts: { kind: MailKind; to: string; ok: boolean }[]): Promise<void> {
  if (attempts.length === 0) return;
  // No RETURNING: a NULL-household row would have to pass email_log's SELECT policy, and fails.
  const rows = attempts.map((a) => ({ household_id: ctx?.household.id ?? null, kind: a.kind, to_hash: hashTo(a.to), ok: a.ok }));
  try {
    if (ctx) await withHousehold(ctx, (tx) => tx`INSERT INTO email_log ${tx(rows, "household_id", "kind", "to_hash", "ok")}`);
    else await withUser(null, (tx) => tx`INSERT INTO email_log ${tx(rows, "household_id", "kind", "to_hash", "ok")}`);
  } catch (err) {
    console.error(`email_log insert failed (${attempts[0].kind}):`, err);
  }
}

export async function sendMail(args: SendMailArgs): Promise<boolean> {
  const m = await prepare(args);
  if (consoleMode()) {
    printConsole(m);
    return true;
  }

  let ok = false;
  try {
    const { error } = await resend().emails.send({
      from: m.from,
      to: args.to,
      subject: args.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    });
    if (error) console.error(`sendMail(${args.kind}) failed for ${args.to}: ${error.name}: ${error.message}`);
    ok = !error;
  } catch (err) {
    console.error(`sendMail(${args.kind}) failed for ${args.to}:`, err);
  }
  await log(args.ctx, [{ kind: args.kind, to: args.to, ok }]);
  return ok;
}

/** Resend's batch endpoint takes at most this many messages per call. */
const BATCH_LIMIT = 100;

/**
 * Household mail in bulk (the reminder batch): Resend's batch endpoint, up to 100 per call, in
 * permissive mode so one bad address fails alone. Returns one ok per message, in order, and logs
 * one email_log row per message, like sendMail.
 */
export async function sendMailBatch(ctx: HouseholdScope, messages: Omit<SendMailArgs, "ctx">[]): Promise<boolean[]> {
  const prepared = await Promise.all(messages.map((m) => prepare({ ...m, ctx })));
  if (consoleMode()) {
    prepared.forEach(printConsole);
    return prepared.map(() => true);
  }

  const results: boolean[] = [];
  for (let i = 0; i < prepared.length; i += BATCH_LIMIT) {
    const chunk = prepared.slice(i, i + BATCH_LIMIT);
    let oks = chunk.map(() => false);
    try {
      const { data, error } = await resend().batch.send(
        chunk.map((m) => ({ from: m.from, to: m.args.to, subject: m.args.subject, html: m.html, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}) })),
        { batchValidation: "permissive" },
      );
      if (error) console.error(`sendMailBatch failed (${chunk.length} messages): ${error.name}: ${error.message}`);
      else {
        const failed = new Set((data?.errors ?? []).map((e) => e.index));
        for (const e of data?.errors ?? []) console.error(`sendMailBatch: ${chunk[e.index]?.args.to} failed: ${e.message}`);
        oks = chunk.map((_, j) => !failed.has(j));
      }
    } catch (err) {
      console.error(`sendMailBatch failed (${chunk.length} messages):`, err);
    }
    results.push(...oks);
  }
  await log(ctx, prepared.map((m, i) => ({ kind: m.args.kind, to: m.args.to, ok: results[i] })));
  return results;
}

/**
 * The sending seam. Reminders, thanks and the cron take a Mailer so verify can pass a recorder
 * (a dev .env.local may hold a real RESEND_API_KEY); the app always uses this one.
 */
export interface Mailer {
  send: typeof sendMail;
  sendBatch: typeof sendMailBatch;
}

export const mailer: Mailer = { send: sendMail, sendBatch: sendMailBatch };

/** Resend's free tier allows 100 sends per UTC day, account-wide. The cron defers past this. */
export const CRON_DAILY_LIMIT = 80;
/** Bulk email is optional and reminders aren't, so it stops earlier (ARCHITECTURE.md §6). */
export const BULK_DAILY_LIMIT = 60;

/** Account-wide sends since the start of now's UTC day (email_sends_since, a definer function). */
export async function sendsToday(tx: Tx, now: Date = new Date()): Promise<number> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [{ n }] = await tx<{ n: number }[]>`SELECT email_sends_since(${since}) AS n`;
  return n;
}
