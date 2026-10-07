"use client";

import { useState } from "react";

export interface TypeOption {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The fields of a bill, shared by "+ Add bill" and the edit dialog: type, statement date (only
 * when the household asks for it), due date, amount, PDF. Total and each share are computed as
 * the amount is typed and shown as read-only figures, never as field-looking boxes.
 */
export default function BillFields({
  idPrefix,
  types,
  shares,
  askBillDate,
  initial,
  feeFor,
  pdf,
}: {
  idPrefix: string;
  types: TypeOption[];
  /** What the total is split over: today's splitters for a new bill, the bill's frozen shares when editing. */
  shares: number;
  askBillDate: boolean;
  initial?: { typeId: number; amount: number; billDate: string; dueDate: string };
  /** The fee a type would add (editing keeps the bill's own fee while its type stays). */
  feeFor?: (typeId: number) => number;
  pdf: { mode: "add" } | { mode: "edit"; hasPdf: boolean };
}) {
  const [typeId, setTypeId] = useState(initial ? String(initial.typeId) : "");
  const [amount, setAmount] = useState(initial ? initial.amount.toFixed(2) : "");
  const id = (name: string) => `${idPrefix}-${name}`;

  const type = types.find((t) => String(t.id) === typeId);
  const fee = type ? (feeFor ? feeFor(type.id) : type.processingFee) : 0;
  const base = Number(amount.trim().replace(/^\$/, "").replaceAll(",", "")) || 0;
  const totalCents = Math.round(base * 100) + Math.round(fee * 100);
  const eachCents = shares > 0 ? Math.round(totalCents / shares) : 0;

  return (
    <>
      <div className={`grid gap-4 ${askBillDate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div>
          <label className="field-label" htmlFor={id("typeId")}>Type</label>
          <select id={id("typeId")} name="typeId" required className="field-input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
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
            <label className="field-label" htmlFor={id("billDate")}>Statement date</label>
            <input className="field-input figure" type="date" id={id("billDate")} name="billDate" defaultValue={initial?.billDate} required />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor={id("dueDate")}>Due date</label>
          <input className="field-input figure" type="date" id={id("dueDate")} name="dueDate" defaultValue={initial?.dueDate} required />
        </div>
      </div>

      <div className="mt-4 sm:max-w-56">
        <label className="field-label" htmlFor={id("amount")}>Amount</label>
        <input
          className="field-input figure"
          type="text"
          inputMode="decimal"
          id={id("amount")}
          name="amount"
          placeholder="0.00"
          autoComplete="off"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <p className="field-output mt-4" aria-live="polite">
        {base > 0 ? (
          <>
            <span>
              Total{" "}
              <output htmlFor={`${id("amount")} ${id("typeId")}`}>${money(totalCents)}</output>
              {fee > 0 && <> (incl. ${fee.toFixed(2)} fee)</>}
            </span>
            <span>
              <output htmlFor={`${id("amount")} ${id("typeId")}`}>${money(eachCents)}</output> each of {shares}
            </span>
          </>
        ) : (
          <span>Enter the amount to see each share{shares > 0 ? ` (split ${shares} ways)` : ""}.</span>
        )}
      </p>

      <div className="mt-4">
        <label className="field-label" htmlFor={id("pdf")}>
          {pdf.mode === "edit" && pdf.hasPdf ? "Replace the statement PDF" : "Statement PDF"} <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input className="field-input" type="file" id={id("pdf")} name="pdf" accept="application/pdf" />
        {pdf.mode === "edit" && pdf.hasPdf && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="removePdf" className="size-4" />
            Remove the PDF on file
          </label>
        )}
        <span className="field-hint">Up to 4 MB.</span>
      </div>
    </>
  );
}
