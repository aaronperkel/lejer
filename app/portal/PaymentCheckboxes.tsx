"use client";

import { useState, useTransition } from "react";
import { setPaidAction } from "@/app/portal/actions";

/**
 * One checkbox per debtor on a bill (its fixed debtor set). Each toggle saves that one row;
 * on failure the box snaps back and says why.
 */
export default function PaymentCheckboxes({
  billId,
  debts,
  canEdit,
}: {
  billId: number;
  debts: { personId: number; name: string; paid: boolean }[];
  canEdit: boolean;
}) {
  const [paid, setPaid] = useState(() => new Set(debts.filter((d) => d.paid).map((d) => d.personId)));
  const [pending, startTransition] = useTransition();

  function toggle(personId: number, checked: boolean) {
    const previous = paid;
    const next = new Set(paid);
    if (checked) next.add(personId);
    else next.delete(personId);
    setPaid(next);
    startTransition(async () => {
      const result = await setPaidAction(billId, personId, checked);
      if (!result.ok) {
        setPaid(previous);
        alert(result.error);
      }
    });
  }

  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${pending ? "opacity-60" : ""}`}>
      {debts.map((d) => (
        <label key={d.personId} className={`inline-flex items-center gap-1.5 py-0.5 text-sm ${canEdit ? "cursor-pointer" : ""}`}>
          <input
            type="checkbox"
            className="size-4 accent-(--primary)"
            checked={paid.has(d.personId)}
            disabled={!canEdit || pending}
            onChange={(e) => toggle(d.personId, e.target.checked)}
          />
          <span>{d.name}</span>
        </label>
      ))}
    </div>
  );
}
