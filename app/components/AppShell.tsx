import type { Viewport } from "next";
import Link from "next/link";
import { Courier_Prime, Fraunces, IBM_Plex_Mono, Karla } from "next/font/google";
import Nav from "@/app/components/Nav";
import { signOut } from "@/app/(site)/login/actions";
import { BRAND } from "@/lib/brand";
import { STATEMENT_DARK, THEME_COLORS } from "@/lib/theme-tokens";
import { type Ctx, homePath } from "@/lib/context";
import { hasFeature, navLinks } from "@/lib/features";
import { withUser } from "@/lib/db";
import { listMyHouseholds } from "@/lib/households";
import { householdPath } from "@/lib/paths";
import type { User } from "@/lib/types";
import "../globals.css";

// The household app's <html>, shared by its two root layouts: app/(household)/[household]
// (a household's pages, themed by it) and app/(app) (account, the household list and
// onboarding, outside any household; /login is on the public site's root, app/(site)). Two roots rather than one because a root layout isn't
// re-rendered by a client navigation that keeps it, and the theme sits on <html>: with the
// household's pages under their own [household] root, moving between households re-renders
// it, and crossing to or from the account pages is a full page load.

// Every face is declared once; globals.css picks per theme through --nf-*. Statement (the
// default) preloads its ledger face. Peach's three load only on a page that uses them, so a
// statement household never downloads them. The tokens verify suite checks these flags.
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-plex" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--nf-fraunces", preload: false });
const karla = Karla({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-karla", preload: false });
const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--nf-courier", preload: false });
const faces = [plex, fraunces, karla, courier].map((f) => f.variable).join(" ");

// The browser chrome follows the page color of the household's theme (statement follows the
// system's light/dark; peach is always cream).
export function appViewport(ctx: Ctx | null): Viewport {
  const h = ctx?.household;
  if (h?.theme === "peach") return { themeColor: THEME_COLORS.peach.page };
  if (h?.colorScheme === "light") return { themeColor: THEME_COLORS.statement.page };
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.statement.page },
      { media: "(prefers-color-scheme: dark)", color: STATEMENT_DARK.page },
    ],
  };
}

export default async function AppShell({ ctx, user, children }: { ctx: Ctx | null; user: User | null; children: React.ReactNode }) {
  const households = user ? await withUser(user.id, (tx) => listMyHouseholds(tx, user.id)) : [];

  // Inside a household: its sections. Outside one (/account, /households, /new) there are none;
  // the name menu carries the person's own pages, and the wordmark goes back to their household.
  const links = ctx ? navLinks(ctx) : [];
  const home = ctx ? householdPath(ctx.household) : user ? await homePath(user) : "/";
  const contact = ctx?.household.replyTo;
  const theme = ctx?.household.theme ?? "statement";
  // Peach is light-only whatever the column says; statement honors the household's choice.
  const scheme = theme === "peach" ? "light" : (ctx?.household.colorScheme ?? "system");

  return (
    <html
      lang="en"
      className={faces}
      data-theme={theme}
      data-color-scheme={scheme}
    >
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink">
        <Nav
          brand={ctx?.household.name ?? BRAND.name}
          tagline={ctx?.household.tagline ?? null}
          home={home}
          links={links}
          households={households.map((h) => ({ id: h.id, name: h.name, href: householdPath(h) }))}
          currentHouseholdId={ctx?.household.id ?? null}
          demo={ctx?.demo ?? false}
          user={user && { name: user.name, email: user.email }}
          signOut={signOut}
        />
        {ctx?.demo && (
          <div className="border-b border-line-soft bg-accent-soft px-4 py-2 text-center text-sm">
            You&apos;re looking at a demo household. Nothing here is real and changes aren&apos;t saved.
          </div>
        )}
        <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8 sm:px-5">{children}</div>
        <footer className="mx-auto w-full max-w-[1000px] px-4 pb-8 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4 text-xs text-ink-muted">
            <span className="font-mono uppercase tracking-[0.1em] [[data-theme=peach]_&]:font-bold">
              {ctx ? `${ctx.household.name} · ${BRAND.name}` : BRAND.name}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {ctx && hasFeature(ctx.household, "welcomeTour") && (
                <Link className="underline decoration-line underline-offset-2 hover:text-ink" href={householdPath(ctx.household, "/welcome")}>
                  How this works
                </Link>
              )}
              {contact && (
                <a className="hover:text-ink" href={`mailto:${contact}`}>
                  {contact}
                </a>
              )}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
