"use server";

import { after } from "next/server";
import { requireUserAction } from "@/lib/auth";
import {
  createBill,
  deleteBill,
  getBill,
  parseAmount,
  prepareBill,
  refreshBillStatus,
  setPaid,
  updateBill,
} from "@/lib/bills";
import { MAX_BILL_PDF_BYTES, billPdfKey, deleteBlob, putBillPdf } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { attempt, done, fail } from "@/lib/flash";
import { NOTICE_DELAY_MINUTES, flushBillNotices, sendBillRemoved } from "@/lib/notices";
import { remindBill } from "@/lib/notify";
import { householdPath } from "@/lib/paths";
import { flushThanks } from "@/lib/thanks";
import { localDate } from "@/lib/time";

// Bill mutations (/{slug}/bills). Each one authorizes itself (proxy.ts is only the first lock),
// refuses politely for the demo, and reports through ?ok= / ?err= (lib/flash.ts). Members and
// bill types are household/actions.ts.

const bills = (ctx: Ctx) => householdPath(ctx.household, "/bills");

/**
 * After a bill mutation: send whatever has outlived its undo window (new-bill emails, receipts)
 * now rather than at the next hourly tick.
 */
function flushQueues(ctx: Ctx): void {
  after(async () => {
    await flushBillNotices(ctx).catch((e) => console.error("notice flush failed:", e));
    if (ctx.household.featureThanks) await flushThanks(ctx).catch((e) => console.error("thanks flush failed:", e));
  });
}

/** Reads and checks a bill PDF from a form: null when none was chosen, errors when it's not a usable PDF. */
async function readPdf(formData: FormData, errors: string[]): Promise<ArrayBuffer | null> {
  const file = formData.get("pdf");
  const pdf = file instanceof File && file.size > 0 ? file : null;
  if (!pdf) return null;
  if (pdf.size > MAX_BILL_PDF_BYTES) {
    errors.push("The PDF can be up to 4 MB.");
    return null;
  }
  const bytes = await pdf.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    errors.push("That file isn't a PDF.");
    return null;
  }
  return bytes;
}

export interface AddBillState {
  errors: string[];
}

/**
 * Posts a bill (useActionState, so validation errors render inline). With a PDF: reserve the
 * bill id, upload to its final key, then insert, so a bill never points at a missing file.
 */
export async function addBill(_prev: AddBillState, formData: FormData): Promise<AddBillState> {
  let ctx: Ctx;
  try {
    ctx = await requireUserAction();
  } catch {
    return { errors: ["Sign in to post bills."] };
  }
  if (ctx.demo) return { errors: [DEMO_REFUSAL] };

  const amount = parseAmount(formData.get("amount"));
  const input = {
    typeId: Number(formData.get("typeId")),
    amount: amount ?? 0,
    billDate: ctx.household.askBillDate ? String(formData.get("billDate") ?? "") : localDate(ctx.household.timezone),
    dueDate: String(formData.get("dueDate") ?? ""),
  };
  const errors: string[] = [];
  if (amount === null) errors.push("Enter the amount on the bill, like 84.20.");
  const bytes = await readPdf(formData, errors);
  if (errors.length) return { errors };

  let pdfPath: string | null = null;
  let created;
  try {
    let billId: number | undefined;
    if (bytes) {
      const prep = await withHousehold(ctx, (tx) => prepareBill(tx, ctx, input));
      billId = prep.billId;
      pdfPath = billPdfKey(ctx.household.id, prep.type.name, input.billDate, billId);
      await putBillPdf(pdfPath, bytes);
    }
    created = await withHousehold(ctx, (tx) => createBill(tx, ctx, input, { billId, pdfPath }));
  } catch (e) {
    if (pdfPath) await deleteBlob(pdfPath).catch(() => {});
    if (e instanceof ActionError) return { errors: [e.message] };
    throw e;
  }

  flushQueues(ctx); // nothing of this bill's yet: its email waits out the window
  const each = `$${created.perPersonCost.toFixed(2)}`;
  const names = created.debtors.map((d) => d.name);
  const who =
    names.length === 0
      ? "Nobody else owes on it."
      : ctx.household.mode === "single_payer"
        ? `Split with the house: ${each} each.`
        : `${names.join(", ")} ${names.length === 1 ? "owes" : "each owe"} ${created.type.ownerName ?? "the house"} ${each}.`;
  done(bills(ctx), `Posted ${created.type.name}. ${who} Everyone's emailed after ${NOTICE_DELAY_MINUTES} minutes, so you can still edit or delete it.`);
}

/**
 * Edits a bill nobody has paid on (useActionState, so errors render inside the dialog). A new
 * PDF uploads first under a fresh key; the old file is deleted only after the edit commits, and
 * the new one is deleted if the edit is refused.
 */
export async function editBill(_prev: AddBillState, formData: FormData): Promise<AddBillState> {
  let ctx: Ctx;
  try {
    ctx = await requireUserAction();
  } catch {
    return { errors: ["Sign in to edit bills."] };
  }
  if (ctx.demo) return { errors: [DEMO_REFUSAL] };

  const billId = Number(formData.get("billId"));
  const amount = parseAmount(formData.get("amount"));
  const errors: string[] = [];
  if (amount === null) errors.push("Enter the amount on the bill, like 84.20.");
  const bytes = await readPdf(formData, errors);
  if (errors.length) return { errors };
  const input = {
    typeId: Number(formData.get("typeId")),
    amount: amount!,
    billDate: String(formData.get("billDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
  };

  let uploaded: string | null = null;
  let edited;
  try {
    let pdfPath: string | null | undefined = formData.get("removePdf") === "on" ? null : undefined;
    if (bytes) {
      // Named for the bill as it will be; the bill's own row is checked (and locked) by updateBill.
      const { typeName, billDate } = await withHousehold(ctx, async (tx) => {
        const bill = await getBill(tx, billId);
        const type = (await tx<{ name: string }[]>`SELECT name FROM bill_types WHERE id = ${input.typeId}`)[0];
        if (!bill || !type) throw new ActionError("That bill no longer exists.");
        return { typeName: type.name, billDate: ctx.household.askBillDate && input.billDate ? input.billDate : bill.billDate };
      });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) throw new ActionError("Enter the statement date as a date.");
      uploaded = billPdfKey(ctx.household.id, typeName, billDate, billId, Date.now().toString(36));
      await putBillPdf(uploaded, bytes);
      pdfPath = uploaded;
    }
    edited = await withHousehold(ctx, (tx) => updateBill(tx, ctx, billId, input, { pdfPath }));
  } catch (e) {
    if (uploaded) await deleteBlob(uploaded).catch(() => {});
    if (e instanceof ActionError) return { errors: [e.message] };
    throw e;
  }
  if (edited.oldPdfPath && edited.oldPdfPath !== edited.pdfPath) {
    await deleteBlob(edited.oldPdfPath).catch((e) => console.error(`couldn't delete ${edited.oldPdfPath}:`, e));
  }
  flushQueues(ctx);
  done(
    bills(ctx),
    `Saved ${edited.typeName}. ${edited.updateQueued ? `Everyone on the bill gets the corrected figures after ${NOTICE_DELAY_MINUTES} minutes.` : `Its email goes out ${NOTICE_DELAY_MINUTES} minutes from now, with these figures.`}`,
  );
}

/** Deletes a bill nobody has paid on, its PDF, and its queued email; tells people if they'd been emailed. */
export async function deleteBillAction(formData: FormData): Promise<void> {
  const ctx = await requireUserAction();
  if (ctx.demo) fail(bills(ctx), DEMO_REFUSAL);
  const removed = await attempt(bills(ctx), () => withHousehold(ctx, (tx) => deleteBill(tx, ctx, Number(formData.get("billId")))));
  if (removed.pdfPath) await deleteBlob(removed.pdfPath).catch((e) => console.error(`couldn't delete ${removed.pdfPath}:`, e));
  if (!removed.notified) done(bills(ctx), `Deleted ${removed.typeName}. Nobody had been emailed about it yet.`);
  const report = await sendBillRemoved(ctx, removed);
  const told = report.sent ? ` Told ${report.sent} ${report.sent === 1 ? "person" : "people"} it's gone.` : "";
  done(bills(ctx), `Deleted ${removed.typeName}.${told}${report.failed ? ` ${report.failed} email${report.failed === 1 ? "" : "s"} didn't send.` : ""}`);
}

/** Payment checkbox (called from PaymentCheckboxes, not a form): one debtor, one bill. */
export async function setPaidAction(billId: number, personId: number, paid: boolean): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireUserAction();
    if (ctx.demo) return { ok: false, error: DEMO_REFUSAL };
    const status = await withHousehold(ctx, (tx) => setPaid(tx, ctx, Number(billId), Number(personId), Boolean(paid)));
    // Receipts and bill emails whose undo window has run out go now, not at the next hourly tick.
    flushQueues(ctx);
    return { ok: true, status };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error("setPaidAction failed:", e);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export async function sendReminder(formData: FormData): Promise<void> {
  const ctx = await requireUserAction();
  if (ctx.demo) fail(bills(ctx), DEMO_REFUSAL);
  const report = await attempt(bills(ctx), () =>
    remindBill(ctx, Number(formData.get("billId"))),
  );
  if (report.sent === 0) fail(bills(ctx), `The ${report.typeName} reminders didn't send. Try again in a minute.`);
  done(bills(ctx), `Reminded ${report.sent} ${report.sent === 1 ? "person" : "people"} about the ${report.typeName} bill.${report.failed ? ` ${report.failed} didn't send.` : ""}`);
}
