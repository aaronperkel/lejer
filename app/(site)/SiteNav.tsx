"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_LINKS } from "@/lib/site";

// The site's page links; the current page is inked and underlined on the header's rule.

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="s-nav" aria-label="Site">
      {SITE_LINKS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={pathname === s.href ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
