"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import SubmitButton from "@/app/components/SubmitButton";
import { removeMember, resendInvite, updateMember } from "@/app/(household)/[household]/portal/actions";
import type { Role } from "@/lib/types";

/**
 * One member's role and splitting, in the shared Dialog (it used to be a <details> squeezed into
 * the table's last cell on a phone). Resend invite and Remove sit on the footer's left, each its
 * own form; Remove asks again. A refused save comes back as the page's flash.
 */
export default function MemberEditDialog({
  member,
  householdName,
  isSelf,
}: {
  member: { id: number; name: string; email: string; role: Role; splitsBills: boolean; joined: boolean };
  householdName: string;
  isSelf: boolean;
}) {
  const formId = `member-${member.id}`;
  return (
    <Dialog
      title={`Edit ${member.name}`}
      description={<span className="figure">{member.email}</span>}
      trigger={(open) => (
        <button type="button" className="btn btn-sm" aria-haspopup="dialog" aria-label={`Edit ${member.name}`} onClick={open}>
          Edit
        </button>
      )}
    >
      {(close) => (
        <>
          <DialogBody>
            <form id={formId} action={updateMember} onSubmit={() => setTimeout(close)} className="space-y-4">
              <input type="hidden" name="membershipId" value={member.id} />
              <div>
                <label className="field-label" htmlFor={`${formId}-role`}>Role</label>
                <select className="field-input" id={`${formId}-role`} name="role" defaultValue={member.role} aria-describedby={`${formId}-role-hint`}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="field-hint" id={`${formId}-role-hint`}>
                  Members see everything and manage bills they own. Admins manage the whole household.
                </span>
              </div>
              <label className="flex min-h-9 items-start gap-2 text-sm">
                <input type="checkbox" name="splitsBills" defaultChecked={member.splitsBills} className="mt-1 size-4" />
                <span>
                  Splits bills
                  <span className="field-hint">Off for someone who only needs to see the ledger. Bills already posted keep their split.</span>
                </span>
              </label>
            </form>
          </DialogBody>
          <DialogFooter
            start={
              <div className="flex flex-wrap gap-2">
                {!member.joined && (
                  <form action={resendInvite}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <SubmitButton className="btn" pendingLabel="Sending…">
                      Resend invite
                    </SubmitButton>
                  </form>
                )}
                {!isSelf && (
                  <form action={removeMember}>
                    <input type="hidden" name="membershipId" value={member.id} />
                    <ConfirmButton
                      className="btn"
                      title={`Remove ${member.name} from ${householdName}?`}
                      body={
                        <>
                          <p>Their unpaid shares on bills already posted are dropped, and any bill type they own goes back to nobody.</p>
                          <p className="mt-2">Bills they fronted stay on record, owed to a former member. They can be invited again later.</p>
                        </>
                      }
                      confirmLabel="Remove"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </ConfirmButton>
                  </form>
                )}
              </div>
            }
          >
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form={formId} className="btn btn-primary">
              Save
            </button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
