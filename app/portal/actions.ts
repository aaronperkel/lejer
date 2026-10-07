"use server";

import { createElement } from "react";
import Invite from "@/emails/Invite";
import { requireAdminAction, requireUserAction } from "@/lib/auth";
import {
  type BillType,
  createBill,
  parseAmount,
  prepareBill,
  refreshBillStatus,
  removeBillType,
  saveBillType,
  setPaid,
} from "@/lib/bills";
import { MAX_BILL_PDF_BYTES, billPdfKey, deleteBlob, putBillPdf } from "@/lib/blob";
import { BRAND } from "@/lib/brand";
import type { Ctx } from "@/lib/context";
import { withHousehold, type Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { done, fail } from "@/lib/flash";
import { getUserByEmail } from "@/lib/households";
import { normalizeEmail } from "@/lib/login-codes";
import { sendMail } from "@/lib/mail";
import { notifyNewBill, remindBill } from "@/lib/notify";
import { localDate } from "@/lib/time";
import type { Role } from "@/lib/types";

// Portal mutations. Each one authorizes itself (proxy.ts is only the first lock), refuses
// politely for the demo, and reports through ?ok= / ?err= (lib/flash.ts).

const BILLS = "/portal";
const MEMBERS = "/portal/household";
const ROLES: Role[] = ["admin", "member"];

/** Runs fn; an ActionError becomes ?err= on path, anything else propagates as a bug. */
async function attempt<T>(path: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ActionError) fail(path, e.message);
    throw e;
  }
}

async function adminCtx(path: string): Promise<Ctx> {
  const ctx = await requireAdminAction();
  if (ctx.demo) fail(path, DEMO_REFUSAL);
  return ctx;
}

function sendInvite(ctx: Ctx, invitee: { email: string; name: string }): Promise<boolean> {
  return sendMail({
    ctx,
    to: invitee.email,
    subject: `${ctx.user.name} added you to ${ctx.household.name} on ${BRAND.name}`,
    react: createElement(Invite, {
      theme: ctx.household.theme,
      householdName: ctx.household.name,
      inviterName: ctx.user.name,
      inviteeName: invitee.name,
      email: invitee.email,
    }),
    kind: "invite",
  });
}

interface MemberRow {
  id: number;
  userId: number;
  role: Role;
  joinedAt: Date | null;
  email: string;
  name: string;
}

async function getMember(tx: Tx, id: number): Promise<MemberRow | null> {
  const [m] = await tx<MemberRow[]>`
    SELECT m.id, m.user_id AS "userId", m.role, m.joined_at AS "joinedAt", u.email, u.name
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = ${id} AND m.household_id = app_household_id()`;
  return m ?? null;
}

/**
 * Invite by email: the users row is created up front (an admin vouched for the address; the
 * name only applies if the person is new here) plus a pending membership. Signing in with
 * that email accepts it.
 */
export async function inviteMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));
  const role = String(formData.get("role")) as Role;
  const splitsBills = formData.get("splitsBills") === "on";
  if (!name || name.length > 80) fail(MEMBERS, "Enter a name (up to 80 characters).");
  if (!email) fail(MEMBERS, "Enter a valid email address.");
  if (!ROLES.includes(role)) fail(MEMBERS, "Pick a role.");

  const { invitee, created } = await withHousehold(ctx, async (tx) => {
    await tx`INSERT INTO users (email, name) VALUES (${email}, ${name}) ON CONFLICT (email) DO NOTHING`;
    const invitee = (await getUserByEmail(tx, email))!;
    const rows = await tx`
      INSERT INTO memberships (household_id, user_id, role, splits_bills, invited_by)
      VALUES (${ctx.household.id}, ${invitee.id}, ${role}, ${splitsBills}, ${ctx.membership.id})
      ON CONFLICT (household_id, user_id) DO NOTHING
      RETURNING id`;
    return { invitee, created: rows.length > 0 };
  });
  if (!created) fail(MEMBERS, `${email} is already in ${ctx.household.name}.`);

  if (!(await sendInvite(ctx, invitee))) {
    fail(MEMBERS, `Added ${invitee.name}, but the invite email didn't send. Try "Resend invite" in a minute.`);
  }
  done(MEMBERS, `Invited ${invitee.name} (${invitee.email}).`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const member = await withHousehold(ctx, (tx) => getMember(tx, Number(formData.get("membershipId"))));
  if (!member) fail(MEMBERS, "That member is no longer in this household.");
  if (member.joinedAt) fail(MEMBERS, `${member.name} has already joined.`);
  if (!(await sendInvite(ctx, member))) fail(MEMBERS, "The invite email didn't send. Try again in a minute.");
  done(MEMBERS, `Sent ${member.name} a new invite.`);
}

/**
 * Role and splits_bills. Names belong to their owners (/account): users.name is shared across
 * households, so one household's admin can't rename someone everywhere.
 */
export async function updateMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const id = Number(formData.get("membershipId"));
  const role = String(formData.get("role")) as Role;
  const splitsBills = formData.get("splitsBills") === "on";
  if (!ROLES.includes(role)) fail(MEMBERS, "Pick a role.");

  const outcome = await withHousehold(ctx, async (tx) => {
    const member = await getMember(tx, id);
    if (!member) return "missing" as const;
    if (member.role === "admin" && role === "member") {
      // Someone who has signed in must stay able to run the household. Lock the admin rows
      // so two concurrent demotions can't both pass.
      const admins = await tx<{ id: number }[]>`
        SELECT id FROM memberships
        WHERE role = 'admin' AND joined_at IS NOT NULL AND id <> ${id}
        FOR UPDATE`;
      if (admins.length === 0) return "last-admin" as const;
    }
    await tx`UPDATE memberships SET role = ${role}, splits_bills = ${splitsBills} WHERE id = ${id}`;
    return member;
  });
  if (outcome === "missing") fail(MEMBERS, "That member is no longer in this household.");
  if (outcome === "last-admin") fail(MEMBERS, "Make someone else an admin first: a household needs one.");
  done(MEMBERS, `Updated ${outcome.name}.`);
}

/**
 * Removes a membership: their debt rows and queued thanks cascade away (bills left with nobody
 * owing become paid); bill types they owned,
 * bills they posted and documents they uploaded keep existing with no owner/poster/uploader.
 */
export async function removeMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const id = Number(formData.get("membershipId"));
  if (id === ctx.membership.id) fail(MEMBERS, "You can't remove yourself. Ask another admin.");

  const result = await withHousehold(ctx, async (tx) => {
    const member = await getMember(tx, id);
    if (!member) return null;
    const [{ owned, openBills }] = await tx<{ owned: number; openBills: number }[]>`
      SELECT (SELECT count(*) FROM bill_types WHERE owner_id = ${id}) AS owned,
             (SELECT count(*) FROM bills WHERE owner_id = ${id} AND status = 'unpaid') AS "openBills"`;
    // Their debt rows cascade away; a bill where they were the last one owing becomes paid.
    const billIds = (await tx<{ id: number }[]>`SELECT bill_id AS id FROM bill_debts WHERE person_id = ${id}`).map((r) => r.id);
    await tx`DELETE FROM memberships WHERE id = ${id}`;
    await refreshBillStatus(tx, billIds);
    return { member, owned, openBills };
  });
  if (!result) fail(MEMBERS, "That member is no longer in this household.");
  const { member, owned, openBills } = result;
  const orphaned =
    (owned ? ` ${owned} bill type${owned === 1 ? "" : "s"} they owned now ${owned === 1 ? "has" : "have"} no owner.` : "") +
    (openBills ? ` ${openBills} open bill${openBills === 1 ? " is" : "s are"} still owed to them, shown as "former member".` : "");
  done(MEMBERS, `Removed ${member.name}.${orphaned}`);
}

// ---------------------------------------------------------------------------------------------
// Bills

export interface AddBillState {
  errors: string[];
}

/**
 * Posts a bill (useActionState, so validation errors render inline). With a PDF: reserve the
 * bill id, upload to its final key, then insert, so a bill never points at a missing file.
 */
export async function addBill(_prev: AddBillState, formData: FormData): Promise<AddBillState> {
  let ctx: Ctx;
  try {
    ctx = await requireUserAction();
  } catch {
    return { errors: ["Sign in to post bills."] };
  }
  if (ctx.demo) return { errors: [DEMO_REFUSAL] };

  const amount = parseAmount(formData.get("amount"));
  const input = {
    typeId: Number(formData.get("typeId")),
    amount: amount ?? 0,
    billDate: ctx.household.askBillDate ? String(formData.get("billDate") ?? "") : localDate(ctx.household.timezone),
    dueDate: String(formData.get("dueDate") ?? ""),
  };
  const file = formData.get("pdf");
  const pdf = file instanceof File && file.size > 0 ? file : null;
  const errors: string[] = [];
  if (amount === null) errors.push("Enter the amount on the bill, like 84.20.");
  if (pdf && pdf.size > MAX_BILL_PDF_BYTES) errors.push("The PDF can be up to 4 MB.");
  const bytes = pdf && pdf.size <= MAX_BILL_PDF_BYTES ? await pdf.arrayBuffer() : null;
  if (bytes && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") errors.push("That file isn't a PDF.");
  if (errors.length) return { errors };

  let pdfPath: string | null = null;
  let created;
  try {
    let billId: number | undefined;
    if (bytes) {
      const prep = await withHousehold(ctx, (tx) => prepareBill(tx, ctx, input));
      billId = prep.billId;
      pdfPath = billPdfKey(ctx.household.id, prep.type.name, input.billDate, billId);
      await putBillPdf(pdfPath, bytes);
    }
    created = await withHousehold(ctx, (tx) => createBill(tx, ctx, input, { billId, pdfPath }));
  } catch (e) {
    if (pdfPath) await deleteBlob(pdfPath).catch(() => {});
    if (e instanceof ActionError) return { errors: [e.message] };
    throw e;
  }

  const report = await notifyNewBill(ctx, created, input.dueDate, pdfPath !== null);
  const each = `$${created.perPersonCost.toFixed(2)}`;
  const names = created.debtors.map((d) => d.name);
  const who =
    names.length === 0
      ? "Nobody else owes on it."
      : ctx.household.mode === "single_payer"
        ? `Split with the house: ${each} each.`
        : `${names.join(", ")} ${names.length === 1 ? "owes" : "each owe"} ${created.type.ownerName ?? "the house"} ${each}.`;
  const mail = report.failed ? ` ${report.failed} email${report.failed === 1 ? "" : "s"} didn't send.` : "";
  done(BILLS, `Posted ${created.type.name}. ${who}${mail}`);
}

/** Payment checkbox (called from PaymentCheckboxes, not a form): one debtor, one bill. */
export async function setPaidAction(billId: number, personId: number, paid: boolean): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireUserAction();
    if (ctx.demo) return { ok: false, error: DEMO_REFUSAL };
    const status = await withHousehold(ctx, (tx) => setPaid(tx, ctx, Number(billId), Number(personId), Boolean(paid)));
    return { ok: true, status };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("setPaidAction failed:", e);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export async function sendReminder(formData: FormData): Promise<void> {
  const ctx = await requireUserAction();
  if (ctx.demo) fail(BILLS, DEMO_REFUSAL);
  const report = await attempt(BILLS, () =>
    remindBill(ctx, Number(formData.get("billId"))),
  );
  if (report.sent === 0) fail(BILLS, `The ${report.typeName} reminders didn't send. Try again in a minute.`);
  done(BILLS, `Reminded ${report.sent} ${report.sent === 1 ? "person" : "people"} about the ${report.typeName} bill.${report.failed ? ` ${report.failed} didn't send.` : ""}`);
}

// ---------------------------------------------------------------------------------------------
// Bill types (on the household tab)

export async function saveBillTypeAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const id = Number(formData.get("typeId")) || undefined;
  const ownerRaw = String(formData.get("ownerId") ?? "");
  const fee = String(formData.get("processingFee") ?? "0").trim();
  const type: BillType = await attempt(MEMBERS, () =>
    withHousehold(ctx, (tx) =>
      saveBillType(tx, ctx, {
        id,
        name: String(formData.get("name") ?? ""),
        emoji: String(formData.get("emoji") ?? ""),
        processingFee: fee === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(fee) ? Number(fee) : NaN,
        ownerId: ownerRaw ? Number(ownerRaw) : null,
      }),
    ),
  );
  done(MEMBERS, `${id ? "Updated" : "Added"} ${type.emoji} ${type.name}.`);
}

export async function removeBillTypeAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const name = await attempt(MEMBERS, () => withHousehold(ctx, (tx) => removeBillType(tx, ctx, Number(formData.get("typeId")))));
  done(MEMBERS, `Removed ${name}.`);
}
