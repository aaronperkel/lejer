import type { Metadata } from "next";
import { BRAND, appUrl } from "@/lib/brand";

// Shared by the two root layouts: the household app (app/(app)/layout.tsx) and the public site
// (app/(site)/layout.tsx). Separate root layouts make Next do a full page load when a visitor
// crosses between them, so neither world's <html> leaks into the other.
export const baseMetadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: "Split household bills with your roommates.",
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en_US", url: "/" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};
