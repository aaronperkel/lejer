import Link from "next/link";
import type { Ctx } from "@/lib/context";

const tabs = [
  { key: "bills", href: "/portal", label: "Bills" },
  { key: "household", href: "/portal/household", label: "Household" },
  { key: "email", href: "/portal/email", label: "Email" },
  { key: "settings", href: "/portal/settings", label: "Settings" },
] as const;

export type PortalTab = (typeof tabs)[number]["key"];

/** Email shows only to admins of a household with bulk email on; the rest are for everyone. */
export default function PortalTabs({ active, ctx }: { active: PortalTab; ctx?: Ctx }) {
  const showEmail = !!ctx && ctx.household.featureBulkEmail && ctx.membership.role === "admin";
  return (
    <div className="mb-6">
      {ctx && <span className="eyebrow mb-1">{ctx.household.name}</span>}
      <h1 className="page-title mb-3">Portal</h1>
      <div className="flex gap-5 overflow-x-auto border-b border-line-soft" role="navigation" aria-label="Portal sections">
        {tabs
          .filter((t) => t.key !== "email" || showEmail)
          .map((t) => (
            <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={`tab shrink-0 ${active === t.key ? "tab-active" : ""}`}>
              {t.label}
            </Link>
          ))}
      </div>
    </div>
  );
}
