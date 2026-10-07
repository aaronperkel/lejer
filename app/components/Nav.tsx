"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Header: the household name as the wordmark (tagline beside it from sm), section links, and a
// household switcher that only appears for people in more than one household. Below sm the
// links fold into one "Menu" disclosure so the bar never overflows a phone. Peach's awning
// tops the header, its scalloped hem hanging over the bar (.awning is display: none in statement). Server actions
// arrive as props.

export interface NavProps {
  brand: string;
  tagline: string | null;
  links: { href: string; label: string }[];
  households: { id: number; name: string }[];
  currentHouseholdId: number | null;
  demo: boolean;
  signedIn: boolean;
  switchHousehold: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export default function Nav({ brand, tagline, links, households, currentHouseholdId, demo, signedIn, switchHousehold, signOut }: NavProps) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const switcher = useRef<HTMLDetailsElement>(null);

  // A disclosure stays open across client navigations; close both whenever the page changes.
  useEffect(() => {
    menu.current?.removeAttribute("open");
    switcher.current?.removeAttribute("open");
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
                <form key={h.id} action={switchHousehold}>
                  <input type="hidden" name="householdId" value={h.id} />
                  <button
                    type="submit"
                    className={`block w-full rounded-(--radius-sm) px-3 py-2 text-left text-sm hover:bg-panel-2 ${h.id === currentHouseholdId ? "font-semibold" : ""}`}
                    aria-current={h.id === currentHouseholdId ? "true" : undefined}
                  >
                    {h.name}
                  </button>
                </form>
              ))}
              <Link href="/households" className="block border-t border-line-soft px-3 py-2 text-sm text-ink-muted hover:text-ink">
                All households
              </Link>
            </div>
          </details>
        ) : (
          <Link href="/" className="flex min-w-0 items-baseline gap-3 no-underline">
            {wordmark}
          </Link>
        )}

        <div className="flex h-full shrink-0 items-center gap-3">
          {/* sm and up: the links in a row */}
          <nav className="hidden h-full items-center gap-5 sm:flex" aria-label="Main navigation">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={isActive(href, pathname) ? "page" : undefined} className="nav-link">
                {label}
              </Link>
            ))}
            {signedIn && (
              <form action={signOut} className="flex h-full items-center">
                <button type="submit" className="nav-link cursor-pointer">
                  Sign out
                </button>
              </form>
            )}
          </nav>

          {demo && (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          )}

          {/* Below sm: one disclosure. Static positioning so the sheet spans the header. */}
          {(links.length > 0 || signedIn) && (
            <details ref={menu} className="nav-menu sm:hidden">
              <summary>
                <span>Menu</span>
                <span className="text-ink-muted" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <nav className="nav-menu-sheet" aria-label="Main navigation">
                {links.map(({ href, label }) => (
                  <Link key={href} href={href} aria-current={isActive(href, pathname) ? "page" : undefined} className="nav-menu-link">
                    {label}
                  </Link>
                ))}
                {signedIn && (
                  <form action={signOut}>
                    <button type="submit" className="nav-menu-link cursor-pointer border-b-0">
                      Sign out
                    </button>
                  </form>
                )}
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
