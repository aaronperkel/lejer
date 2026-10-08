import type { Metadata, Viewport } from "next";
import AppShell, { appViewport } from "@/app/components/AppShell";
import { baseMetadata } from "@/app/metadata";
import { getSessionUser } from "@/lib/context";

// Root layout for the pages outside any household: /login, /account, /households, /new.
// Household pages have their own root at app/(household)/[household] (see AppShell).

export const metadata: Metadata = baseMetadata;

export const viewport: Viewport = appViewport(null);

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell ctx={null} user={await getSessionUser()}>
      {children}
    </AppShell>
  );
}
