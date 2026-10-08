"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Header: the household name as the wordmark (tagline beside it from sm), the household's
// section links, a household switcher that only appears for people in more than one household
// (links to each household's own URL), and at the right edge a menu under the person's name for
// their own pages (account, households, sign out), which live outside any household. Below sm
// both sets of links fold into one "Menu" disclosure so the bar never overflows a phone. Peach's awning
// tops the header, its scalloped hem hanging over the bar (.awning is display: none in statement). Server actions
// arrive as props.

export interface NavProps {
  brand: string;
  tagline: string | null;
  /** Where the wordmark goes: the household's dashboard, or the public site outside one. */
  home: string;
  links: { href: string; label: string }[];
  households: { id: number; name: string; href: string }[];
  currentHouseholdId: number | null;
  demo: boolean;
  /** The signed-in person, for the name menu; null signed out (the demo). */
  user: { name: string; email: string } | null;
  signOut: () => Promise<void>;
}

/** The name menu's links: the person's own pages, outside any household. */
const YOU_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/households", label: "Your households" },
];

export default function Nav({ brand, tagline, home, links, households, currentHouseholdId, demo, user, signOut }: NavProps) {
  const pathname = usePathname();
  // The dashboard is the household's own root, so it only matches exactly.
  const isActive = (href: string) => (href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`));
  const menu = useRef<HTMLDetailsElement>(null);
  const switcher = useRef<HTMLDetailsElement>(null);
  const you = useRef<HTMLDetailsElement>(null);

  // A disclosure stays open across client navigations; close them all whenever the page changes.
  useEffect(() => {
    for (const d of [menu, switcher, you]) d.current?.removeAttribute("open");
  }, [pathname]);

  const wordmark = (
    <>
      <span className="wordmark">{brand}</span>
      {tagline && <span className="eyebrow mt-0.5 hidden truncate md:inline">{tagline}</span>}
    </>
  );

  return (
    <header className="relative border-b border-line-soft bg-panel">
      <div className="awning" aria-hidden="true" />
      <div className="mx-auto flex h-13 max-w-[1000px] items-center justify-between gap-4 px-4 sm:px-5 [[data-theme=peach]_&]:h-14">
        {households.length > 1 ? (
          <details ref={switcher} className="relative min-w-0">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
              {wordmark}
              <span className="text-ink-muted" aria-hidden="true">
                ▾
              </span>
              <span className="sr-only">Switch household</span>
            </summary>
            <div className="panel absolute left-0 z-30 mt-2 min-w-56 p-1 shadow-sm">
              {households.map((h) => (
                <Link
                  key={h.id}
                  href={h.href}
                  className={`block rounded-(--radius-sm) px-3 py-2 text-sm no-underline hover:bg-panel-2 ${h.id === currentHouseholdId ? "font-semibold" : ""}`}
                  aria-current={h.id === currentHouseholdId ? "true" : undefined}
                >
                  {h.name}
                </Link>
              ))}
              <Link href="/households" className="block border-t border-line-soft px-3 py-2 text-sm text-ink-muted hover:text-ink">
                All households
              </Link>
            </div>
          </details>
        ) : (
          <Link href={home} className="flex min-w-0 items-baseline gap-3 no-underline">
            {wordmark}
          </Link>
        )}

        <div className="flex h-full shrink-0 items-center gap-3">
          {/* sm and up: the links in a row */}
          <nav className="hidden h-full items-center gap-5 sm:flex" aria-label="Main navigation">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-link">
                {label}
              </Link>
            ))}
          </nav>

          {user && (
            <>
              {links.length > 0 && <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />}
              <details ref={you} className="relative hidden h-full sm:block">
                <summary className="nav-link cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden">
                  <span className="max-w-40 truncate">{user.name}</span>
                  <span aria-hidden="true">▾</span>
                </summary>
                <div className="panel absolute right-0 top-full z-30 mt-1 min-w-56 p-1 shadow-sm">
                  <span className="block truncate px-3 pb-1 pt-2 text-xs text-ink-muted">{user.email}</span>
                  {YOU_LINKS.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={isActive(href) ? "page" : undefined}
                      className="block rounded-(--radius-sm) px-3 py-2 text-sm no-underline hover:bg-panel-2 aria-[current=page]:font-semibold"
                    >
                      {label}
                    </Link>
                  ))}
                  <form action={signOut} className="border-t border-line-soft">
                    <button type="submit" className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink-muted hover:text-ink">
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            </>
          )}

          {demo && (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          )}

          {/* Below sm: one disclosure. Static positioning so the sheet spans the header. */}
          {(links.length > 0 || user) && (
            <details ref={menu} className="nav-menu sm:hidden">
              <summary>
                <span>Menu</span>
                <span className="text-ink-muted" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <nav className="nav-menu-sheet" aria-label="Main navigation">
                {links.map(({ href, label }) => (
                  <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-menu-link">
                    {label}
                  </Link>
                ))}
                {user && (
                  <>
                    <span className="eyebrow block truncate pb-1 pt-4">{user.name}</span>
                    {YOU_LINKS.map(({ href, label }) => (
                      <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-menu-link">
                        {label}
                      </Link>
                    ))}
                    <form action={signOut}>
                      <button type="submit" className="nav-menu-link cursor-pointer border-b-0">
                        Sign out
                      </button>
                    </form>
                  </>
                )}
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
