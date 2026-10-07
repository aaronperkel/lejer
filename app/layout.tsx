import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import Nav from "@/app/components/Nav";
import { switchHousehold } from "@/app/households/actions";
import { signOut } from "@/app/login/actions";
import { BRAND, appUrl } from "@/lib/brand";
import { getCtx, getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { listMyHouseholds } from "@/lib/households";
import "./globals.css";

// The statement theme's ledger face. Peach's faces (and preload: false per theme) land in phase 5.
const ledger = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ledger" });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: "Split household bills with your roommates.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [ctx, user] = await Promise.all([getCtx(), getSessionUser()]);
  const households = user ? await withUser(user.id, (tx) => listMyHouseholds(tx, user.id)) : [];

  const links = ctx
    ? [
        { href: "/", label: "Dashboard" },
        { href: "/portal", label: "Portal" },
        ...(ctx.household.featureDocuments ? [{ href: "/documents", label: "Docs" }] : []),
        ...(ctx.demo ? [] : [{ href: "/account", label: "Account" }]),
      ]
    : user
      ? [{ href: "/account", label: "Account" }]
      : [];
  const contact = ctx?.household.replyTo;

  return (
    <html
      lang="en"
      className={ledger.variable}
      data-theme={ctx?.household.theme ?? "statement"}
      data-color-scheme={ctx?.household.colorScheme ?? "system"}
    >
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink">
        <Nav
          brand={ctx?.household.name ?? BRAND.name}
          links={links}
          households={households.map(({ id, name }) => ({ id, name }))}
          currentHouseholdId={ctx?.household.id ?? null}
          demo={ctx?.demo ?? false}
          signedIn={!!user}
          switchHousehold={switchHousehold}
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
            <span className="font-mono uppercase tracking-[0.1em]">
              {ctx ? `${ctx.household.name} · ${BRAND.name}` : BRAND.name}
            </span>
            {contact && (
              <a className="hover:text-ink" href={`mailto:${contact}`}>
                {contact}
              </a>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
