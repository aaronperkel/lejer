import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Archivo, Martian_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { getSessionUser, homePath } from "@/lib/context";
import { SITE_LINKS } from "@/lib/site";
import { baseMetadata } from "@/app/metadata";
import SiteNav from "./SiteNav";
import "../globals.css";
import "./site.css";

// The public site's own root layout (lib/site.ts). It is a separate root from the household app
// (app/components/AppShell.tsx), so crossing between them (the demo link, a finished sign-in,
// "Open your household") is a full page load and neither <html> carries into the other. /login
// lives here too, so the home page's sign-up form carries on into the code step in one look. "/" is this site for everyone; a signed-in visitor's way in is the header's button.
// globals.css comes along for Tailwind's base and the reduced-motion rule; site.css overrides
// its theme on html[data-site].
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--f-archivo",
});
const martian = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--f-martian",
});

export const metadata: Metadata = baseMetadata;

export const viewport: Viewport = {
  themeColor: "#f3f5f4",
  colorScheme: "light",
};

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const home = user ? await homePath(user) : null;
  return (
    <html lang="en" data-site="">
      <body>
        <div className={`site ${archivo.variable} ${martian.variable}`}>
          {/* One row at every width: wordmark, the two page links, then the way in. */}
          <header className="s-header">
            <div className="s-wrap s-header-row">
              <Link href="/" className="s-wordmark">
                {BRAND.name}
              </Link>
              <SiteNav />
              <div className="s-header-actions">
                {home ? (
                  <Link className="s-btn s-btn-sm" href={home}>
                    {home === "/new" ? "Set up your household" : "Open your household"}
                  </Link>
                ) : (
                  <>
                    <Link className="s-link" href="/login">
                      Sign in
                    </Link>
                    {/* On a phone the hero's demo link is a thumb away, so the button yields the room. */}
                    <Link className="s-btn s-btn-sm s-btn-line s-header-demo" href="/demo">
                      Try the demo
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>

          {children}

          <footer className="s-footer">
            <div className="s-wrap s-footer-row">
              <Link href="/" className="s-wordmark s-wordmark-sm">
                {BRAND.name}
              </Link>
              <nav className="s-footer-links" aria-label="Footer">
                {SITE_LINKS.map((s) => (
                  <Link key={s.href} href={s.href}>
                    {s.label}
                  </Link>
                ))}
                {user ? <Link href="/households">Your households</Link> : <Link href="/login">Sign in</Link>}
                <Link href="/demo">Try the demo</Link>
              </nav>
              <p className="s-footer-note">
                © {new Date().getFullYear()} Built by <a href={BRAND.legalUrl}>{BRAND.legalName}</a>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
