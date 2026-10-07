"use server";

import { createElement } from "react";
import Invite from "@/emails/Invite";
import { requireAdminAction } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import { withHousehold, type Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { done, fail } from "@/lib/flash";
import { getUserByEmail } from "@/lib/households";
import { normalizeEmail } from "@/lib/login-codes";
import { sendMail } from "@/lib/mail";
import type { Role } from "@/lib/types";
import { BRAND } from "@/lib/brand";

// Portal mutations. Each one authorizes itself (proxy.ts is only the first lock), refuses
// politely for the demo, and reports through ?ok= / ?err= (lib/flash.ts).

const MEMBERS = "/portal/household";
const ROLES: Role[] = ["admin", "member"];

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
 * Removes a membership: their debts and queued thanks cascade away; bill types they owned,
 * bills they posted and documents they uploaded keep existing with no owner/poster/uploader.
 */
export async function removeMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(MEMBERS);
  const id = Number(formData.get("membershipId"));
  if (id === ctx.membership.id) fail(MEMBERS, "You can't remove yourself. Ask another admin.");

  const result = await withHousehold(ctx, async (tx) => {
    const member = await getMember(tx, id);
    if (!member) return null;
    const [{ owned }] = await tx<{ owned: number }[]>`
      SELECT count(*) AS owned FROM bill_types WHERE owner_id = ${id}`;
    await tx`DELETE FROM memberships WHERE id = ${id}`;
    return { member, owned };
  });
  if (!result) fail(MEMBERS, "That member is no longer in this household.");
  const { member, owned } = result;
  const orphaned = owned
    ? ` ${owned} bill type${owned === 1 ? "" : "s"} they owned now ${owned === 1 ? "has" : "have"} no owner.`
    : "";
  done(MEMBERS, `Removed ${member.name}.${orphaned}`);
}
