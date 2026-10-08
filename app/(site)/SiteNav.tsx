"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SHEETS } from "@/lib/site";

// The sheet index: the site's pages, numbered like the sheets of a drawing set.

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="s-index" aria-label="Site">
      {SHEETS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={pathname === s.href ? "page" : undefined}>
          <span className="s-sheetno" aria-hidden="true">
            {s.no}
          </span>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
