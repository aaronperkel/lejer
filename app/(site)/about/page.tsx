import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import Signup from "../Signup";

export const metadata: Metadata = {
  title: "About",
  description: `What ${BRAND.name} is, where it came from, and what it won't do.`,
};

export default function About() {
  return (
    <main>
      <div className="s-wrap">
        <header className="s-page-head">
          <h1 className="s-h1">A ledger for the house, not a payment app.</h1>
          <p className="s-lede">
            {BRAND.name} keeps the bills you share with the people you live with, along with who owes what to whom and by when, so
            nobody has to keep a spreadsheet or chase anyone by text.
          </p>
        </header>
      </div>

      <section className="s-section" aria-labelledby="origin-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="origin-title">
              Where it came from
            </h2>
          </div>
          <div>
            <p className="s-prose">
              It started as two small apps for two apartments. In the first, <strong>one roommate paid every bill</strong> and
              everyone paid them back. In the second, <strong>each bill had its own person</strong>: one had the electric, another
              the internet, and everyone owed everyone a little.
            </p>
            <p className="s-prose">
              Both apps did the same job: post the statement, show each person their share, remind them before it was due, and check
              them off once they&apos;d paid. So they became one product, with a setting for each way of running a house.
            </p>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="believe-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="believe-title">
              What it holds to
            </h2>
          </div>
          <ol className="s-notes s-notes-plain">
            <li>
              <h3 className="s-h3">Calm about money.</h3>
              <p>This is money between friends who live together. Nothing should feel alarming, salesy or flimsy, and the record should be visibly accurate.</p>
            </li>
            <li>
              <h3 className="s-h3">The number comes first.</h3>
              <p>On any screen, what you owe or are owed, to whom and by when, is the first thing you can read, even on a phone.</p>
            </li>
            <li>
              <h3 className="s-h3">Nobody gets nagged.</h3>
              <p>Reminders inform without guilt. Every email has to earn its place in your inbox.</p>
            </li>
            <li>
              <h3 className="s-h3">Record, don&apos;t transact.</h3>
              <p>
                {BRAND.name} never holds or moves money. The person who fronts a bill and the roommate who owes on it are served
                equally.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="s-section" aria-labelledby="maker-title">
        <div className="s-wrap s-split">
          <div className="s-section-head">
            <h2 className="s-h2" id="maker-title">
              Who makes it
            </h2>
          </div>
          <div>
            <p className="s-prose">
              {BRAND.name} is made by <strong>{BRAND.legalName}</strong>. It&apos;s free, with no ads and no card, and it grows by
              word of mouth: one house tells the next.
            </p>
            <p className="s-prose">
              Your household&apos;s bills, amounts and statements are visible only to its members, and each household&apos;s records are
              kept separate in the database itself.
            </p>
          </div>
        </div>
      </section>

      <section className="s-close" aria-labelledby="close-title">
        <div className="s-wrap">
          <div className="s-close-panel">
            <div>
              <h2 className="s-h2" id="close-title">
                Start your household.
              </h2>
              <p className="s-prose">Invite your roommates by email, and the next bill goes on the record.</p>
            </div>
            <div>
              <Signup id="close-email" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
