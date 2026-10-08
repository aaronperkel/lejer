import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { loadTour } from "@/lib/views";
import Tour from "./Tour";

export const metadata: Metadata = { title: "How it works" };

// The welcome tour (feature_welcome_tour). The dashboard sends each member here once, the first
// time they open the household; afterwards the footer's "How this works" link brings it back.
export default async function WelcomePage() {
  const ctx = await requireUser();
  requireFeature(ctx, "welcomeTour");
  const owners = await loadTour(ctx);
  const h = ctx.household;
  return (
    <Tour
      name={ctx.user.name}
      household={h.name}
      mode={h.mode}
      owners={owners}
      reminders={h.remindersEnabled ? { first: h.firstReminderDays, urgent: h.urgentReminderDays } : null}
      firstVisit={!ctx.membership.welcomedAt}
    />
  );
}
