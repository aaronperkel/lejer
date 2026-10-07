"use client";

import { useActionState, useEffect, useRef } from "react";
import ConfirmButton from "@/app/components/ConfirmButton";
import Dialog, { DialogBody, DialogFooter, type DialogHandle } from "@/app/components/Dialog";
import { PencilIcon } from "@/app/components/icons";
import { type AddBillState, deleteBillAction, editBill } from "@/app/portal/actions";
import BillFields, { type TypeOption } from "@/app/portal/BillFields";
import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";

export interface EditableBill {
  id: number;
  typeId: number;
  typeName: string;
  label: string; // "Gas, Oct 1"
  amount: number;
  fee: number;
  shares: number;
  billDate: string;
  dueDate: string;
  hasPdf: boolean;
  notified: boolean;
}

/**
 * Edit or delete a bill nobody has paid on. The split is over the bill's own frozen shares, so
 * the figures here are what will be saved. Delete asks again in its own dialog (nested natively).
 */
export default function EditBillDialog({ bill, types, askBillDate }: { bill: EditableBill; types: TypeOption[]; askBillDate: boolean }) {
  const [state, formAction, pending] = useActionState<AddBillState, FormData>(editBill, { errors: [] });
  const formId = `edit-bill-${bill.id}`;
  const dialog = useRef<DialogHandle>(null);
  const wasPending = useRef(false);
  // A save that went through redirects with ?ok=; close so the flash is what shows.
  useEffect(() => {
    if (wasPending.current && !pending && state.errors.length === 0) dialog.current?.close();
    wasPending.current = pending;
  }, [pending, state]);

  const emailNote = bill.notified
    ? `Everyone on the bill already got an email about it, so saving sends them the corrected figures ${NOTICE_DELAY_MINUTES} minutes later.`
    : "Its email hasn't gone out yet; saving restarts the wait, so people only hear about the corrected bill.";

  return (
    <Dialog
      wide
      handle={dialog}
      title={`Edit ${bill.label}`}
      description={<span className="block max-w-[60ch]">{emailNote}</span>}
      trigger={(open) => (
        <button type="button" className="btn-icon" title="Edit or delete" aria-label={`Edit ${bill.label}`} aria-haspopup="dialog" onClick={open}>
          <PencilIcon />
        </button>
      )}
    >
      {(close) => (
          <>
            <DialogBody>
              {state.errors.length > 0 && (
                <div className="flash flash-err" role="alert">
                  <ul className={state.errors.length > 1 ? "list-disc pl-5" : ""}>
                    {state.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form id={formId} action={formAction}>
                <input type="hidden" name="billId" value={bill.id} />
                <BillFields
                  idPrefix={formId}
                  types={types}
                  shares={bill.shares}
                  askBillDate={askBillDate}
                  initial={{ typeId: bill.typeId, amount: bill.amount, billDate: bill.billDate, dueDate: bill.dueDate }}
                  feeFor={(typeId) => (typeId === bill.typeId ? bill.fee : (types.find((t) => t.id === typeId)?.processingFee ?? 0))}
                  pdf={{ mode: "edit", hasPdf: bill.hasPdf }}
                />
              </form>
            </DialogBody>
            <DialogFooter
              start={
                <form action={deleteBillAction}>
                  <input type="hidden" name="billId" value={bill.id} />
                  <ConfirmButton
                    className="btn"
                    title={`Delete ${bill.label}?`}
                    body={
                      bill.notified
                        ? "It comes off the record for everyone, with its PDF. The people it was emailed to get a short note that it's gone."
                        : "It comes off the record with its PDF, and its email is cancelled: nobody has heard about it yet."
                    }
                    confirmLabel="Delete bill"
                    pendingLabel="Deleting…"
                  >
                    Delete bill
                  </ConfirmButton>
                </form>
              }
            >
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending}>
                {pending ? "Saving…" : "Save bill"}
              </button>
            </DialogFooter>
          </>
      )}
    </Dialog>
  );
}
