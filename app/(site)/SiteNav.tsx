"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SHEETS, SITE_HOME } from "@/lib/site";

// The sheet index: the site's pages, numbered like the sheets of a drawing set.

export default function SiteNav() {
  const pathname = usePathname();
  // "/" is served from SITE_HOME by a rewrite; either path means the home sheet.
  const current = pathname === SITE_HOME ? "/" : pathname;
  return (
    <nav className="s-index" aria-label="Site">
      {SHEETS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={current === s.href ? "page" : undefined}>
          <span className="s-sheetno" aria-hidden="true">
            {s.no}
          </span>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
