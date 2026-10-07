"use client";

import { useEffect, useRef } from "react";

/**
 * IANA zone select. With `detect` (onboarding) it starts on the browser's own zone when that is
 * in the list; without it (settings) it shows the saved value.
 */
export default function TimezoneSelect({ zones, fallback, detect = false }: { zones: string[]; fallback: string; detect?: boolean }) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!detect) return;
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ref.current && zones.includes(local)) ref.current.value = local;
  }, [zones, detect]);
  return (
    <select ref={ref} className="field-input" id="timezone" name="timezone" defaultValue={fallback}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}
