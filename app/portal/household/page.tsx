import type { Metadata } from "next";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import BillTypesSection from "@/app/portal/BillTypesSection";
import PortalTabs from "@/app/portal/PortalTabs";
import { requireUser } from "@/lib/auth";
import { getBillTypes } from "@/lib/bills";
import { BRAND } from "@/lib/brand";
import { withHousehold } from "@/lib/db";
import { DEMO_BILL_TYPES, DEMO_PEOPLE } from "@/lib/demo";
import type { Role } from "@/lib/types";
import { inviteMember } from "../actions";
import MemberEditDialog from "./MemberEditDialog";

export const metadata: Metadata = { title: "Household" };

interface MemberView {
  id: number;
  name: string;
  email: string;
  role: Role;
  splitsBills: boolean;
  joinedAt: Date | null;
  invitedAt: Date | null;
}

// Members and bill types. Everyone in the household can read it; only admins see the controls.
export default async function MembersPage({ searchParams }: PageProps<"/portal/household">) {
  const ctx = await requireUser();
  const { ok, err } = await searchParams;
  const isAdmin = ctx.membership.role === "admin";

  const { members, types } = ctx.demo
    ? { members: DEMO_PEOPLE.map((p) => ({ ...p, joinedAt: new Date(), invitedAt: null })), types: DEMO_BILL_TYPES }
    : await withHousehold(ctx, async (tx) => ({
        members: await tx<MemberView[]>`
          SELECT m.id, u.name, u.email, m.role, m.splits_bills AS "splitsBills",
                 m.joined_at AS "joinedAt", m.invited_at AS "invitedAt"
          FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.household_id = ${ctx.household.id} -- memberships_read also admits my rows elsewhere
          ORDER BY m.joined_at IS NULL, u.name`,
        types: await getBillTypes(tx),
      }));

  const shortDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ctx.household.timezone });

  return (
    <main className="space-y-8">
      <div>
        <PortalTabs active="household" ctx={ctx} />
        <Flash ok={ok} err={err} />
      </div>

      <section className="panel overflow-hidden">
        <table className="data-table table-stack table-stack-people">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {isAdmin && <th className="num">
                  <span className="sr-only">Manage</span>
                </th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="cell-name">
                  <span className="font-medium">{m.name}</span>
                  {m.id === ctx.membership.id && <span className="ml-1 text-ink-muted">(you)</span>}
                  <span className="block text-xs text-ink-muted">
                    {m.joinedAt ? "Joined" : `Invited ${m.invitedAt ? shortDate(m.invitedAt) : ""}, hasn't signed in`}
                    {m.splitsBills ? "" : " · doesn't split bills"}
                  </span>
                </td>
                <td className="cell-email text-ink-muted">{m.email}</td>
                <td className="cell-role">
                  <span className="tag bg-panel-2 text-ink-muted">{m.role}</span>
                </td>
                {isAdmin && (
                  <td className="cell-actions num">
                    <MemberEditDialog
                      member={{ id: m.id, name: m.name, email: m.email, role: m.role, splitsBills: m.splitsBills, joined: m.joinedAt !== null }}
                      householdName={ctx.household.name}
                      isSelf={m.id === ctx.membership.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <BillTypesSection
        types={types}
        people={members.map(({ id, name }) => ({ id, name }))}
        ledger={ctx.household.mode === "ledger"}
        canEdit={isAdmin}
      />

      {isAdmin && (
        <section className="panel p-5">
          <span className="eyebrow mb-1">Invite a roommate</span>
          <p className="mb-4 max-w-[60ch] text-sm text-ink-muted">
            They&apos;ll get an email from {BRAND.name}. Signing in with that address joins {ctx.household.name}.
          </p>
          <form action={inviteMember} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="invite-name">Name</label>
              <input className="field-input" id="invite-name" name="name" maxLength={80} required />
            </div>
            <div>
              <label className="field-label" htmlFor="invite-email">Email</label>
              <input className="field-input" id="invite-email" name="email" type="email" required />
            </div>
            <div>
              <label className="field-label" htmlFor="invite-role">Role</label>
              <select className="field-input" id="invite-role" name="role" defaultValue="member" aria-describedby="invite-role-hint">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <span className="field-hint" id="invite-role-hint">
                Members see everything and manage bills they own. Admins manage the whole household.
              </span>
            </div>
            <label className="flex items-start gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="splitsBills" defaultChecked className="mt-1" />
              <span>
                Splits bills
                <span className="field-hint">Uncheck for someone who only needs to see the ledger.</span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <SubmitButton className="btn btn-primary" pendingLabel="Inviting…">Send invite</SubmitButton>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
