"use client";

import { useState } from "react";
import ConfirmButton from "@/app/components/ConfirmButton";
import { removeBillTypeAction, saveBillTypeAction } from "@/app/portal/actions";

export interface BillTypeRow {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
  ownerId: number | null;
  ownerName: string | null;
}

type Modal = { mode: "closed" } | { mode: "add" } | { mode: "edit"; type: BillTypeRow };

/**
 * Bill types with their owner (who fronts the bill). In single-payer mode the owner column is
 * hidden: every type belongs to the payer, and the server enforces that.
 */
export default function BillTypesSection({
  types,
  people,
  ledger,
  canEdit,
}: {
  types: BillTypeRow[];
  people: { id: number; name: string }[];
  ledger: boolean;
  canEdit: boolean;
}) {
  const [modal, setModal] = useState<Modal>({ mode: "closed" });
  const editing = modal.mode === "edit" ? modal.type : null;
  const cols = 2 + (ledger ? 1 : 0) + (canEdit ? 1 : 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bill types</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        {canEdit && (
          <button type="button" className="btn btn-sm" onClick={() => setModal({ mode: "add" })}>
            + Add bill type
          </button>
        )}
      </div>
      <div className="panel overflow-x-auto">
        <table className="data-table table-stack table-stack-types">
          <thead>
            <tr>
              <th>Bill type</th>
              {ledger && <th>Owner (pays the provider)</th>}
              <th className="num">Processing fee</th>
              {canEdit && (
                <th className="num">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td className="cell-type font-medium">
                  {t.emoji} {t.name}
                </td>
                {ledger && <td className="cell-owner text-ink-muted">{t.ownerName ?? "Nobody (split by everyone)"}</td>}
                <td className="num figure cell-fee text-ink-muted">
                  ${t.processingFee.toFixed(2)}
                  <span className="sm:hidden"> fee</span>
                </td>
                {canEdit && (
                  <td className="num cell-actions">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className="btn btn-sm" onClick={() => setModal({ mode: "edit", type: t })}>
                        Edit
                      </button>
                      <form action={removeBillTypeAction} className="inline">
                        <input type="hidden" name="typeId" value={t.id} />
                        <ConfirmButton
                          className="btn btn-sm"
                          title={`Remove ${t.name}?`}
                          body="It disappears from the add-bill list. A type with bills on record can't be removed, so nothing posted is lost."
                          confirmLabel="Remove"
                          pendingLabel="Removing…"
                        >
                          Remove
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={cols} className="text-center text-ink-muted">No bill types yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.mode !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal({ mode: "closed" });
          }}
        >
          <div className="panel max-h-[85dvh] w-full max-w-md overflow-y-auto p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold">{editing ? `Edit ${editing.name}` : "Add a bill type"}</h3>
            <form action={saveBillTypeAction}>
              {editing && <input type="hidden" name="typeId" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
                <div>
                  <label className="field-label" htmlFor="bt-name">Name</label>
                  <input className="field-input" id="bt-name" name="name" placeholder="Water" defaultValue={editing?.name} maxLength={40} required autoFocus />
                </div>
                <div>
                  <label className="field-label" htmlFor="bt-emoji">Emoji</label>
                  <input className="field-input" id="bt-emoji" name="emoji" placeholder="💧" defaultValue={editing?.emoji} required />
                </div>
              </div>
              <div className={`mt-4 grid gap-4 ${ledger ? "sm:grid-cols-2" : ""}`}>
                {ledger && (
                  <div>
                    <label className="field-label" htmlFor="bt-owner">Owner</label>
                    <select className="field-input" id="bt-owner" name="ownerId" defaultValue={editing?.ownerId ?? ""}>
                      <option value="">Nobody (split by everyone)</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-ink-muted">They pay the provider; everyone else pays them back.</p>
                  </div>
                )}
                <div>
                  <label className="field-label" htmlFor="bt-fee">Processing fee</label>
                  <input
                    className="field-input figure"
                    id="bt-fee"
                    name="processingFee"
                    inputMode="decimal"
                    defaultValue={editing ? editing.processingFee.toFixed(2) : "0.00"}
                  />
                  <p className="mt-1 text-xs text-ink-muted">Added to every bill of this type before it&apos;s split.</p>
                </div>
              </div>
              <div className="mt-6 flex gap-2">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn" onClick={() => setModal({ mode: "closed" })}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
