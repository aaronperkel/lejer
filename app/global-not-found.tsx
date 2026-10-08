import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";
import "./(site)/site.css";

// Any URL that matches no route. Signed-out visitors never see it (proxy.ts sends them to
// /login first), so it speaks to someone signed in or in the demo. It sits outside both root
// layouts, so it's a full page with the site's drafting-sheet look and plain links.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-archivo" });
const martian = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--f-martian" });

export const metadata: Metadata = { title: `Page not found — ${BRAND.name}` };

export default function GlobalNotFound() {
  return (
    <html lang="en" data-site="">
      <body>
        <div className={`site ${archivo.variable} ${martian.variable}`}>
          <main className="s-wrap">
            <div className="s-page-head">
              <p className="s-key">404</p>
              <h1 className="s-h1">There&apos;s no page at this address.</h1>
              <p className="s-lede">It may have moved, or the link has a typo.</p>
              <p className="s-demo-link s-404-actions">
                <a className="s-btn" href="/">
                  Back to your household
                </a>
                <a className="s-link" href="/about">
                  About {BRAND.name}
                </a>
              </p>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
