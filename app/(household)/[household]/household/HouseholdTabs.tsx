import Link from "next/link";
import type { Ctx } from "@/lib/context";
import { householdPath } from "@/lib/paths";

const tabs = [
  { key: "members", path: "/household", label: "Members" },
  { key: "settings", path: "/household/settings", label: "Settings" },
  { key: "email", path: "/household/email", label: "Email" },
] as const;

export type HouseholdTab = (typeof tabs)[number]["key"];

/**
 * The Household section's header: who's in it (with the bill types), how it runs, and the bulk
 * note. Email shows only to admins of a household with bulk email on; the rest are for everyone.
 */
export default function HouseholdTabs({ active, ctx }: { active: HouseholdTab; ctx: Ctx }) {
  const showEmail = ctx.household.featureBulkEmail && ctx.membership.role === "admin";
  return (
    <div className="mb-6">
      <span className="eyebrow mb-1">{ctx.household.name}</span>
      <h1 className="page-title mb-3">Household</h1>
      <div className="flex gap-5 overflow-x-auto border-b border-line-soft" role="navigation" aria-label="Household sections">
        {tabs
          .filter((t) => t.key !== "email" || showEmail)
          .map((t) => (
            <Link
              key={t.key}
              href={householdPath(ctx.household, t.path)}
              aria-current={active === t.key ? "page" : undefined}
              className={`tab shrink-0 ${active === t.key ? "tab-active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
      </div>
    </div>
  );
}
