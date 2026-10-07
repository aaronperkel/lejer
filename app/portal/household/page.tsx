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
import { inviteMember, removeMember, resendInvite, updateMember } from "../actions";

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
        <PortalTabs active="household" householdName={ctx.household.name} />
        <Flash ok={ok} err={err} />
      </div>

      <section className="panel overflow-hidden">
        <table className="data-table table-stack table-stack-people">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {isAdmin && <th className="num">Manage</th>}
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
                    <details className="inline-block text-left">
                      <summary className="btn btn-sm cursor-pointer list-none">Edit</summary>
                      <div className="mt-2 space-y-3 sm:w-64">
                        <form action={updateMember} className="space-y-2">
                          <input type="hidden" name="membershipId" value={m.id} />
                          <select className="field-input" name="role" defaultValue={m.role} aria-label="Role">
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="splitsBills" defaultChecked={m.splitsBills} />
                            Splits bills
                          </label>
                          <SubmitButton className="btn btn-sm btn-primary" pendingLabel="Saving…">Save</SubmitButton>
                        </form>
                        <div className="flex flex-wrap gap-2">
                          {!m.joinedAt && (
                            <form action={resendInvite}>
                              <input type="hidden" name="membershipId" value={m.id} />
                              <SubmitButton className="btn btn-sm" pendingLabel="Sending…">Resend invite</SubmitButton>
                            </form>
                          )}
                          {m.id !== ctx.membership.id && (
                            <form action={removeMember}>
                              <input type="hidden" name="membershipId" value={m.id} />
                              <SubmitButton className="btn btn-sm text-unpaid" pendingLabel="Removing…">Remove</SubmitButton>
                            </form>
                          )}
                        </div>
                      </div>
                    </details>
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
          <p className="mb-4 text-sm text-ink-muted">
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
              <select className="field-input" id="invite-role" name="role" defaultValue="member">
                <option value="member">Member: sees everything, manages bills they own</option>
                <option value="admin">Admin: manages the whole household</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="splitsBills" defaultChecked />
              Splits bills (uncheck for someone who only needs to see the ledger)
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
