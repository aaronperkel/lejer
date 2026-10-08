"use client";

import { useActionState, useState } from "react";
import { type AddBillState, addBill } from "@/app/(household)/[household]/bills/actions";
import BillFields, { type TypeOption } from "@/app/(household)/[household]/bills/BillFields";
import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";

/**
 * "+ Add bill" disclosure. Asks for the statement date only when the household's ask_bill_date
 * is on (otherwise the server stamps today in the household's timezone). The PDF is optional.
 * `types` is already filtered to what the viewer may post (all for admins, owned for members).
 */
export default function AddBillForm({ types, splitterCount, askBillDate }: { types: TypeOption[]; splitterCount: number; askBillDate: boolean }) {
  const [state, formAction, pending] = useActionState<AddBillState, FormData>(addBill, { errors: [] });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const show = open || (state.errors.length > 0 && !dismissed);

  const toggle = (next: boolean) => {
    setOpen(next);
    setDismissed(!next);
  };

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bills</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        {types.length > 0 && (
          <button type="button" className={`btn ${show ? "" : "btn-primary"}`} aria-expanded={show} onClick={() => toggle(!show)}>
            {show ? "Close" : "+ Add bill"}
          </button>
        )}
      </div>

      {show && (
        <div className="panel mb-5 p-5">
          {state.errors.length > 0 && (
            <div className="flash flash-err" role="alert">
              <ul className="list-disc pl-5">
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <form action={formAction}>
            <BillFields idPrefix="add" types={types} shares={splitterCount} askBillDate={askBillDate} pdf={{ mode: "add" }} />
            <p className="field-hint mt-3">
              Everyone who splits it gets an email {NOTICE_DELAY_MINUTES} minutes after you post, so there&apos;s time to fix a mistake first.
            </p>

            <div className="mt-5 flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Posting…" : "Post bill"}
              </button>
              <button type="button" className="btn" onClick={() => toggle(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
