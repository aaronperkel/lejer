import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import FloorPlan, { type UtilId } from "../FloorPlan";
import Signup, { Arrow } from "../Signup";

export const metadata: Metadata = {
  title: {
    absolute: `${BRAND.name}: shared bills for the people you live with`,
  },
  description:
    "Post each house bill with its statement. Everyone sees their share, gets reminded before it's due, and checks off when they've paid. Free, no ads.",
};

// Served at "/" for signed-out visitors (proxy.ts rewrites it here; lib/site.ts).
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
      <div className="s-wrap">
        <section className="s-sheet" aria-labelledby="hero-title">
          <div className="s-sheet-grid">
            <div className="s-tb">
              <div className="s-tb-cell">
                <h1 className="s-h1" id="hero-title">
                  Every house bill, split and on the record.
                </h1>
                <p className="s-lede">
                  Whoever gets the bill posts it with the statement. Everyone
                  sees their share, gets a reminder before it&apos;s due, and
                  checks it off once they&apos;ve paid.
                </p>
              </div>
              <div className="s-tb-cell s-tb-grow">
                <Signup id="hero-email" />
              </div>
            </div>
            <div className="s-drawing">
              <FloorPlan due={due} />
            </div>
            {/* After the plan in source order, so a phone reaches the plan sooner; beside it from 1080px. */}
            <div className="s-tb-fields">
              <div className="s-tb-field">
                <span className="s-tb-key">Price</span>
                <span className="s-tb-val">Free. No ads. No card.</span>
              </div>
              <div className="s-tb-field">
                <span className="s-tb-key">Money</span>
                <span className="s-tb-val">Never moves it</span>
              </div>
              <div className="s-tb-field">
                <span className="s-tb-key">Sign in</span>
                <span className="s-tb-val">Email code, no password</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="s-section" aria-labelledby="notes-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="notes-title">
              General notes
            </h2>
            <p className="s-prose">
              {BRAND.name} keeps the household&apos;s recurring bills on record,
              so nobody has to keep a spreadsheet or chase anyone by text.
            </p>
          </div>
          <ol className="s-notes">
            <li>
              <h3 className="s-h3">It never touches the money.</h3>
              <p>
                Pay each other however you already do: Venmo, cash, a bank
                transfer. {BRAND.name} records that it happened. There&apos;s
                nothing to link and no card on file.
              </p>
            </li>
            <li>
              <h3 className="s-h3">Every bill keeps its statement.</h3>
              <p>
                Attach the provider&apos;s PDF when you post a bill, and anyone
                in the house can check the math later.
              </p>
            </li>
            <li>
              <h3 className="s-h3">
                Shares are fixed when the bill is posted.
              </h3>
              <p>
                The bill is split among whoever lives there when it&apos;s
                posted. Someone who moves in later never owes on an old bill.
              </p>
            </li>
            <li>
              <h3 className="s-h3">
                One person pays, or everyone fronts something.
              </h3>
              <p>
                Some houses have one roommate who pays every bill. Others split
                it up: one person has electric, another has internet. Pick the
                one that fits and switch whenever you like.
              </p>
            </li>
            <li>
              <h3 className="s-h3">Private to your household.</h3>
              <p>
                Only members see the bills, the amounts and the statements. Each
                household&apos;s records are kept apart in the database itself.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="s-section" aria-labelledby="remind-title">
        <div className="s-wrap">
          <div className="s-section-head">
            <h2 className="s-h2" id="remind-title">
              Reminders on the house&apos;s schedule, so nobody has to send
              them.
            </h2>
            <p className="s-prose">
              Your house picks the hour and the windows. Here are the defaults
              for a bill due on the 15th. Every due date also lands in each
              person&apos;s own calendar feed, for Apple or Google Calendar.
            </p>
          </div>
          <div
            className="s-dim"
            role="img"
            aria-label="Reminder schedule for a bill due on the 15th: an email when it's posted on the 1st, a heads-up on the 8th, a reminder each day from the 12th, then every 3 days after the 15th until it's paid."
          >
            <div className="s-dim-track" aria-hidden="true">
              {[
                ["1st", "Posted", "An email to everyone on the bill"],
                ["8th", "7 days out", "One heads-up"],
                ["12th", "Last 3 days", "A reminder each day"],
                ["15th", "Due", "Then every 3 days until it's paid"],
              ].map(([date, num, what], i) => (
                <div
                  key={date}
                  className={`s-dim-seg${i === 3 ? " s-dim-seg-over" : ""}`}
                >
                  <span className="s-dim-num">
                    {date} · {num}
                  </span>
                  <span className="s-dim-what">{what}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="s-mail">
            <div className="s-mail-item">
              <div className="s-mail-subject">
                New bill: Electric, $26.03 your share
              </div>
              <div className="s-mail-from">
                From Demo House via {BRAND.name}, when the bill is posted
              </div>
            </div>
            <div className="s-mail-item">
              <div className="s-mail-subject">
                Due soon: your Electric share
              </div>
              <div className="s-mail-from">
                In the last few days. Replies go straight to Jordan, who fronted
                it
              </div>
            </div>
            <div className="s-mail-item">
              <div className="s-mail-subject">Payment recorded: Electric</div>
              <div className="s-mail-from">
                Once you&apos;re checked off, if your house turns receipts on
              </div>
            </div>
          </div>
          <Link className="s-link s-more" href="/how-it-works">
            See how a whole month goes
            <Arrow />
          </Link>
        </div>
      </section>

      <section className="s-close" aria-labelledby="close-title">
        <div className="s-wrap">
          <div className="s-close-panel">
            <div>
              <h2 className="s-h2" id="close-title">
                Put the next bill on the record.
              </h2>
              <p className="s-prose">
                Add the bills you split and invite your roommates by email. The
                next statement that arrives goes on the record.
              </p>
            </div>
            <div>
              <Signup id="close-email" wide />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
