"use client";

import { useState } from "react";

/** A read-only value with a Copy button (the calendar link, for apps that take a URL). */
export default function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input className="field-input figure min-w-0" id={id} value={value} readOnly spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              document.getElementById(id)?.focus();
            }
          }}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
