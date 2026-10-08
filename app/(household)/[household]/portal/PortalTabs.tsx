import Link from "next/link";
import type { Ctx } from "@/lib/context";
import { householdPath } from "@/lib/paths";

const tabs = [
  { key: "bills", path: "/portal", label: "Bills" },
  { key: "household", path: "/portal/household", label: "Household" },
  { key: "email", path: "/portal/email", label: "Email" },
  { key: "settings", path: "/portal/settings", label: "Settings" },
] as const;

export type PortalTab = (typeof tabs)[number]["key"];

/**
 * Email shows only to admins of a household with bulk email on; the rest are for everyone.
 * Without ctx (the loading shell, which can't see the URL's household) the tabs are inert.
 */
export default function PortalTabs({ active, ctx }: { active: PortalTab; ctx?: Ctx }) {
  const showEmail = !!ctx && ctx.household.featureBulkEmail && ctx.membership.role === "admin";
  return (
    <div className="mb-6">
      {ctx && <span className="eyebrow mb-1">{ctx.household.name}</span>}
      <h1 className="page-title mb-3">Portal</h1>
      <div className="flex gap-5 overflow-x-auto border-b border-line-soft" role="navigation" aria-label="Portal sections">
        {tabs
          .filter((t) => t.key !== "email" || showEmail)
          .map((t) => {
            const className = `tab shrink-0 ${active === t.key ? "tab-active" : ""}`;
            return ctx ? (
              <Link key={t.key} href={householdPath(ctx.household, t.path)} aria-current={active === t.key ? "page" : undefined} className={className}>
                {t.label}
              </Link>
            ) : (
              <span key={t.key} className={className}>
                {t.label}
              </span>
            );
          })}
      </div>
    </div>
  );
}
