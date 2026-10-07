"use client";

import { useEffect, useState } from "react";

/**
 * Due-date chip, computed in the browser so "days until due" reflects the
 * viewer's local date (same behavior as the PHP site's app.js).
 */
export default function DueChip({ due, paid }: { due: string; paid: boolean }) {
  const [state, setState] = useState<{ label: string; cls: string } | null>(null);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(due + "T00:00:00");
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
    const dateDisplay = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(dueDate);

    if (paid) {
      setState({ label: dateDisplay, cls: "due-paid" });
    } else if (diffDays < 0) {
      setState({ label: `${dateDisplay} • Past due ${Math.abs(diffDays)}d`, cls: "due-past" });
    } else if (diffDays === 0) {
      setState({ label: `${dateDisplay} • Due today`, cls: "due-soon" });
    } else if (diffDays <= 3) {
      setState({ label: `${dateDisplay} • Due in ${diffDays}d`, cls: "due-soon" });
    } else {
      setState({ label: `${dateDisplay} • Due in ${diffDays}d`, cls: "due-future" });
    }
  }, [due, paid]);

  if (!state) return <span className="due-chip due-future">&nbsp;</span>;
  return (
    <span className={`due-chip ${state.cls}`} aria-label={`Due date: ${due}`}>
      {state.label}
    </span>
  );
}
