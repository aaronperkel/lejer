import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import FloorPlan, { type UtilId } from "./FloorPlan";
import Signup, { Arrow } from "./Signup";

export const metadata: Metadata = {
  title: {
    absolute: `${BRAND.name}: shared bills for the people you live with`,
  },
  description:
    "Post each house bill with its statement. Everyone sees their share, gets reminded before it's due, and checks off when they've paid. Free, no ads.",
};

// "/" for everyone, signed in or not (lib/site.ts). Households live at /{slug}.
// Top to bottom: the pitch and the way in, the one drawing, three facts, a last chance to start.
export default function Home() {
  // Sample due dates, relative to today so the plan never looks stale.
  const fmt = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const due: Record<UtilId, string> = {
    electric: fmt(6),
    gas: fmt(5),
    water: fmt(19),
    wifi: fmt(12),
  };

  return (
    <main>
      <section className="s-hero" aria-labelledby="hero-title">
        <div className="s-wrap">
          <h1 className="s-h1" id="hero-title">
            Every house bill, split and on the record.
          </h1>
          <p className="s-lede">
            Whoever gets the bill posts it with the statement. Everyone sees their share, gets a
            reminder before it&apos;s due, and checks it off once they&apos;ve paid. Free, with no
            ads and no card, and it never moves money.
          </p>
          <Signup id="hero-email" />
        </div>
      </section>

      <div className="s-wrap">
        <section className="s-sheet" aria-label="A sample household, drawn as a floor plan">
          <FloorPlan due={due} />
        </section>
      </div>

      <section className="s-section" aria-labelledby="facts-title">
        <div className="s-wrap">
          <h2 className="sr-only" id="facts-title">
            Three things to know
          </h2>
          <ul className="s-facts">
            <li>
              <h3 className="s-h3">It never touches the money.</h3>
              <p>
                Pay each other however you already do: Venmo, cash, a bank transfer.{" "}
                {BRAND.name} records that it happened.
              </p>
            </li>
            <li>
              <h3 className="s-h3">Attach the statement to any bill.</h3>
              <p>Anyone in the house can open the provider&apos;s PDF and check the math later.</p>
            </li>
            <li>
              <h3 className="s-h3">Who splits a bill is set when it&apos;s posted.</h3>
              <p>Roommates who move in later never owe on it.</p>
            </li>
          </ul>
          <p className="s-prose s-facts-more">
            Reminders go out on the house&apos;s schedule, and every due date lands in your own
            calendar.{" "}
            <Link className="s-link s-link-arrow" href="/how-it-works">
              See how a whole month goes
              <Arrow />
            </Link>
          </p>
        </div>
      </section>

      <section className="s-close" aria-labelledby="close-title">
        <div className="s-wrap s-close-row">
          <div>
            <h2 className="s-h2" id="close-title">
              Put the next bill on the record.
            </h2>
            <p className="s-prose">Invite your roommates by email. Private to your household, free, no card.</p>
          </div>
          <Signup id="close-email" />
        </div>
      </section>
    </main>
  );
}
