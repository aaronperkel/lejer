import type { Metadata } from "next";
import { BRAND, appUrl } from "@/lib/brand";

// Shared by the root layouts: the public site (app/(site)/layout.tsx), a household's pages
// (app/(household)/[household]/layout.tsx) and the account pages (app/(app)/layout.tsx).
// Separate root layouts make Next do a full page load when a visitor crosses between them, so
// no world's <html> leaks into another.
export const baseMetadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: "Split household bills with your roommates.",
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en_US", url: "/" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};
