"use client";

import { useActionState } from "react";
import { type BulkEmailState, sendBulkEmailAction } from "@/app/portal/email/actions";

/** Subject + message to everyone who has joined. Errors come back inline with the draft intact. */
export default function BulkEmailForm({ count, fits, retryAfter }: { count: number; fits: boolean; retryAfter: string }) {
  const [state, formAction, pending] = useActionState<BulkEmailState, FormData>(sendBulkEmailAction, { errors: [] });
  const people = `${count} ${count === 1 ? "person" : "people"}`;
  return (
    <form action={formAction} className="panel space-y-4 p-5">
      {state.errors.length > 0 && (
        <div className="flash flash-err mb-0" role="alert">
          <ul className={state.errors.length > 1 ? "list-disc pl-5" : ""}>
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <label className="field-label" htmlFor="subject">Subject</label>
        <input className="field-input" id="subject" name="subject" defaultValue={state.subject ?? ""} maxLength={150} required />
      </div>
      <div>
        <label className="field-label" htmlFor="body">Message</label>
        <textarea className="field-input min-h-40 leading-relaxed" id="body" name="body" rows={8} defaultValue={state.body ?? ""} maxLength={10000} required />
        <p className="mt-1 text-xs text-ink-muted">A blank line starts a new paragraph. Replies come back to you.</p>
      </div>
      {!fits && (
        <p className="flash flash-err mb-0" role="status">
          Today&apos;s email allowance is nearly used up, and what&apos;s left is saved for reminders and sign-in codes. Try again after {retryAfter}.
        </p>
      )}
      <div className="flex items-center gap-3 border-t border-line-soft pt-4">
        <button type="submit" className="btn btn-primary" disabled={pending || !fits || count === 0} aria-busy={pending}>
          {pending ? "Sending…" : `Email ${people}`}
        </button>
      </div>
    </form>
  );
}
