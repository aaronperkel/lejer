"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import SubmitButton from "@/app/components/SubmitButton";
import { removeBillTypeAction, saveBillTypeAction } from "@/app/(household)/[household]/household/actions";

export interface BillTypeRow {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
  ownerId: number | null;
  ownerName: string | null;
}

/**
 * Bill types with their owner (who fronts the bill). In single-payer mode the owner column is
 * hidden: every type belongs to the payer, and the server enforces that. Adding and editing
 * happen in the shared Dialog; a refused save comes back as the page's flash.
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
  const cols = 2 + (ledger ? 1 : 0) + (canEdit ? 1 : 0);

  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bill types</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        {canEdit && (
          <BillTypeDialog
            people={people}
            ledger={ledger}
            trigger={(open) => (
              <button type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={open}>
                + Add bill type
              </button>
            )}
          />
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
                      <BillTypeDialog
                        type={t}
                        people={people}
                        ledger={ledger}
                        trigger={(open) => (
                          <button type="button" className="btn btn-sm" aria-haspopup="dialog" aria-label={`Edit ${t.name}`} onClick={open}>
                            Edit
                          </button>
                        )}
                      />
                      <form action={removeBillTypeAction} className="inline">
                        <input type="hidden" name="typeId" value={t.id} />
                        <ConfirmButton
                          className="btn btn-sm"
                          buttonProps={{ "aria-label": `Remove ${t.name}` }}
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
    </section>
  );
}

/** Add (no `type`) or edit one bill type, in the shared Dialog. */
function BillTypeDialog({
  type,
  people,
  ledger,
  trigger,
}: {
  type?: BillTypeRow;
  people: { id: number; name: string }[];
  ledger: boolean;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const id = (name: string) => `bt-${type?.id ?? "new"}-${name}`;
  return (
    <Dialog title={type ? `Edit ${type.name}` : "Add a bill type"} trigger={trigger}>
      {(close) => (
        <form action={saveBillTypeAction} onSubmit={() => setTimeout(close)}>
          {type && <input type="hidden" name="typeId" value={type.id} />}
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
              <div>
                <label className="field-label" htmlFor={id("name")}>Name</label>
                <input className="field-input" id={id("name")} name="name" placeholder="Water" defaultValue={type?.name} maxLength={40} required autoFocus />
              </div>
              <div>
                <label className="field-label" htmlFor={id("emoji")}>Emoji</label>
                <input className="field-input" id={id("emoji")} name="emoji" placeholder="💧" defaultValue={type?.emoji} required />
              </div>
            </div>
            <div className={`mt-4 grid gap-4 ${ledger ? "sm:grid-cols-2" : ""}`}>
              {ledger && (
                <div>
                  <label className="field-label" htmlFor={id("owner")}>Owner</label>
                  <select className="field-input" id={id("owner")} name="ownerId" defaultValue={type?.ownerId ?? ""}>
                    <option value="">Nobody (split by everyone)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">They pay the provider; everyone else pays them back. Bills already posted keep their owner.</p>
                </div>
              )}
              <div>
                <label className="field-label" htmlFor={id("fee")}>Processing fee</label>
                <input
                  className="field-input figure"
                  id={id("fee")}
                  name="processingFee"
                  inputMode="decimal"
                  defaultValue={type ? type.processingFee.toFixed(2) : "0.00"}
                />
                <p className="field-hint">Added to every bill of this type before it&apos;s split.</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Saving…">
              {type ? "Save" : "Add bill type"}
            </SubmitButton>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
