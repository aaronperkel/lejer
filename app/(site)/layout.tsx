import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Archivo, Martian_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import { getSessionUser } from "@/lib/context";
import { SHEETS } from "@/lib/site";
import { baseMetadata } from "@/app/metadata";
import SiteNav from "./SiteNav";
import "../globals.css";
import "./site.css";

// The public site's own root layout (lib/site.ts). It is a separate root from the household app
// (app/(app)/layout.tsx), so crossing between them (the demo link, sign-in, the sign-up form's
// redirect to the code step) is a full page load and neither <html> carries into the other.
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
  return (
    <html lang="en" data-site="">
      <body>
        <div className={`site ${archivo.variable} ${martian.variable}`}>
          <header className="s-header">
            <div className="s-wrap">
              <div className="s-header-row">
                <Link href="/" className="s-wordmark">
                  {BRAND.name}
                </Link>
                <SiteNav />
                <div className="s-header-actions">
                  {user ? (
                    <Link className="s-btn s-btn-sm" href="/">
                      Open your household
                    </Link>
                  ) : (
                    <>
                      <Link className="s-link" href="/login">
                        Sign in
                      </Link>
                      <Link className="s-btn s-btn-sm s-btn-line" href="/demo">
                        Try the demo
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="s-header-index-row">
              <div className="s-wrap">
                <SiteNav />
              </div>
            </div>
          </header>

          {children}

          <footer className="s-footer">
            <div className="s-wrap s-footer-grid">
              <div className="s-footer-cell">
                <Link href="/" className="s-wordmark">
                  {BRAND.name}
                </Link>
                <p className="s-footer-note">
                  Shared bills for the people you live with. Free, no ads. It
                  records payments and never moves money.
                </p>
              </div>
              <div className="s-footer-cell">
                <span className="s-tb-key">Sheets</span>
                <ul>
                  {SHEETS.map((s) => (
                    <li key={s.href}>
                      <Link href={s.href}>{s.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="s-footer-cell">
                <span className="s-tb-key">Start</span>
                <ul>
                  <li>
                    {user ? (
                      <Link href="/households">Your households</Link>
                    ) : (
                      <Link href="/login">Sign in or sign up</Link>
                    )}
                  </li>
                  <li>
                    <Link href="/demo">Try the demo</Link>
                  </li>
                </ul>
              </div>
              <div className="s-footer-cell">
                <span className="s-tb-key">Made by</span>
                <p className="s-footer-note">
                  Aaron Perkel LLC
                  <br />© {new Date().getFullYear()}
                </p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
