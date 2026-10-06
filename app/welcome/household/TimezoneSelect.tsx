"use client";

import { useEffect, useRef } from "react";

/** IANA zone select that starts on the browser's own zone when it is in the list. */
export default function TimezoneSelect({ zones, fallback }: { zones: string[]; fallback: string }) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ref.current && zones.includes(local)) ref.current.value = local;
  }, [zones]);
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
