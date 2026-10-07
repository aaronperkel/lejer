"use client";

import { useActionState, useState } from "react";
import { type AddBillState, addBill } from "@/app/portal/actions";

interface TypeOption {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
}

/**
 * "+ Add bill" disclosure. Asks for the statement date only when the household's ask_bill_date
 * is on (otherwise the server stamps today in the household's timezone). The PDF is optional.
 * `types` is already filtered to what the viewer may post (all for admins, owned for members).
 */
export default function AddBillForm({ types, splitterCount, askBillDate }: { types: TypeOption[]; splitterCount: number; askBillDate: boolean }) {
  const [state, formAction, pending] = useActionState<AddBillState, FormData>(addBill, { errors: [] });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const show = open || (state.errors.length > 0 && !dismissed);

  const toggle = (next: boolean) => {
    setOpen(next);
    setDismissed(!next);
  };

  const fee = types.find((t) => String(t.id) === typeId)?.processingFee ?? 0;
  const base = parseFloat(amount) || 0;
  const totalCents = Math.round(base * 100) + Math.round(fee * 100);
  const each = splitterCount > 0 ? Math.round(totalCents / splitterCount) / 100 : 0;

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bills</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        {types.length > 0 && (
          <button type="button" className={`btn btn-sm ${show ? "" : "btn-primary"}`} aria-expanded={show} onClick={() => toggle(!show)}>
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
            <div className={`grid gap-4 ${askBillDate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div>
                <label className="field-label" htmlFor="typeId">Type</label>
                <select id="typeId" name="typeId" required className="field-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.emoji} {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {askBillDate && (
                <div>
                  <label className="field-label" htmlFor="billDate">Statement date</label>
                  <input className="field-input figure" type="date" id="billDate" name="billDate" required />
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="dueDate">Due date</label>
                <input className="field-input figure" type="date" id="dueDate" name="dueDate" required />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="amount">Amount</label>
                <input
                  className="field-input figure"
                  type="text"
                  inputMode="decimal"
                  id="amount"
                  name="amount"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <span className="field-label">
                  Total {fee > 0 && <small className="font-normal text-ink-muted">(+${fee.toFixed(2)} fee)</small>}
                </span>
                <div className="field-input figure opacity-70">{base > 0 ? (totalCents / 100).toFixed(2) : "—"}</div>
              </div>
              <div>
                <span className="field-label">Each of {splitterCount}</span>
                <div className="field-input figure opacity-70">{base > 0 ? each.toFixed(2) : "—"}</div>
              </div>
            </div>

            <div className="mt-4">
              <label className="field-label" htmlFor="pdf">Statement PDF <span className="font-normal text-ink-muted">(optional)</span></label>
              <input className="field-input" type="file" id="pdf" name="pdf" accept="application/pdf" />
              <small className="text-xs text-ink-muted">Up to 4 MB. Everyone who splits the bill gets an email.</small>
            </div>

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
