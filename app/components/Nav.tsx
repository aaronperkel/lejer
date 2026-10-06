"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Header: the household name as the brand, section links, and a household switcher that
// only appears for people in more than one household. Server actions arrive as props.

export interface NavProps {
  brand: string;
  links: { href: string; label: string }[];
  households: { id: number; name: string }[];
  currentHouseholdId: number | null;
  demo: boolean;
  signedIn: boolean;
  switchHousehold: (formData: FormData) => Promise<void>;
  signOut: () => Promise<void>;
}

export default function Nav({ brand, links, households, currentHouseholdId, demo, signedIn, switchHousehold, signOut }: NavProps) {
  const pathname = usePathname();
  const brandClass = "font-mono text-[0.8rem] font-semibold uppercase tracking-[0.14em] whitespace-nowrap";

  return (
    <header className="border-b border-line-soft bg-panel">
      <div className="mx-auto flex h-13 max-w-[1000px] items-center justify-between gap-4 px-4 sm:px-5">
        {households.length > 1 ? (
          <details className="relative">
            <summary className={`${brandClass} cursor-pointer list-none`}>
              {brand} <span className="text-ink-muted">▾</span>
            </summary>
            <div className="panel absolute left-0 z-10 mt-2 min-w-56 p-1 shadow-sm">
              {households.map((h) => (
                <form key={h.id} action={switchHousehold}>
                  <input type="hidden" name="householdId" value={h.id} />
                  <button
                    type="submit"
                    className={`block w-full rounded-(--radius-sm) px-3 py-2 text-left text-sm hover:bg-panel-2 ${
                      h.id === currentHouseholdId ? "font-semibold" : ""
                    }`}
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
          <Link href="/" className={brandClass}>
            {brand}
          </Link>
        )}

        <nav className="flex h-full items-center gap-4 sm:gap-5" aria-label="Main navigation">
          {links.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full items-center border-b-2 px-0.5 text-sm font-medium transition-colors duration-100 ${
                  active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {demo && (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          )}
          {signedIn && (
            <form action={signOut}>
              <button type="submit" className="text-sm font-medium text-ink-muted hover:text-ink">
                Sign out
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
