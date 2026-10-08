import type { Metadata, Viewport } from "next";
import AppShell, { appViewport } from "@/app/components/AppShell";
import { baseMetadata } from "@/app/metadata";
import { getCtx, getSessionUser } from "@/lib/context";

// Root layout for one household's pages, /{slug}/…, themed by that household. A root layout
// under the [household] segment re-renders when the slug changes, so moving between households
// never keeps the last one's name or theme (AppShell). Pages authorize themselves.

export const metadata: Metadata = baseMetadata;

export async function generateViewport(): Promise<Viewport> {
  return appViewport(await getCtx());
}

export default async function HouseholdLayout({ children }: LayoutProps<"/[household]">) {
  const [ctx, user] = await Promise.all([getCtx(), getSessionUser()]);
  return (
    <AppShell ctx={ctx} user={user}>
      {children}
    </AppShell>
  );
}
