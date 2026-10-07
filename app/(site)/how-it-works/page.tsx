import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import Signup from "../Signup";

export const metadata: Metadata = {
  title: "How it works",
  description: `How a month goes in ${BRAND.name}: a bill arrives, it's posted with its statement, everyone sees their share, and payments get checked off.`,
};

export default function HowItWorks() {
  return (
    <main>
      <div className="s-wrap">
        <header className="s-page-head">
          <h1 className="s-h1">How a month goes.</h1>
          <p className="s-lede">
            A statement arrives, the person who pays that bill posts it, and everyone else sees what they owe and by when. Paying
            happens wherever you already pay each other. {BRAND.name} keeps the record.
          </p>
        </header>
      </div>

      <section className="s-section" aria-labelledby="steps-title">
        <div className="s-wrap">
          <h2 className="s-h2 sr-only" id="steps-title">
            The monthly cycle
          </h2>
          <p className="fp-sample s-steps-note">The examples use the sample household from the home page: Robin, Jordan, Casey and Morgan.</p>
          <ol className="s-steps">
            <li>
              <div>
                <h3 className="s-h3">The statement arrives</h3>
                <p className="s-prose">
                  Every kind of bill in your house (electric, gas, water, wifi) has an owner: the person
                  whose name is on the account and who pays the provider. In a single-payer house that&apos;s one person for
                  everything.
                </p>
              </div>
              <div className="s-step-aside">
                <b>Electric</b> · Jordan
                <br />
                <b>Gas</b> · Casey
                <br />
                <b>Water</b> · Morgan
                <br />
                <b>Wifi</b> · Robin
              </div>
            </li>
            <li>
              <div>
                <h3 className="s-h3">They post it</h3>
                <p className="s-prose">
                  The amount, the due date, the statement date if your house uses it, and the provider&apos;s PDF. Any processing
                  fee is added on top, and the total is split among everyone who shares bills, the owner included. The owner&apos;s
                  own share is simply covered.
                </p>
              </div>
              <div className="s-step-aside">
                $101.12 + $3.00 fee = <b>$104.12</b>
                <br />
                $104.12 ÷ 4 = <b>$26.03 each</b>
                <br />
                3 people owe Jordan $26.03
              </div>
            </li>
            <li>
              <div>
                <h3 className="s-h3">Everyone on it gets an email</h3>
                <p className="s-prose">
                  The email waits ten minutes after posting, so a typo can be fixed before anyone sees it. Until someone has paid, the
                  owner can still correct or delete the bill. If the email already went out, everyone gets one short note saying what
                  changed.
                </p>
              </div>
              <div className="s-step-aside">New bill: Electric, $26.03 your share</div>
            </li>
            <li>
              <div>
                <h3 className="s-h3">People pay however they like</h3>
                <p className="s-prose">
                  Venmo, cash, a bank transfer, a burrito. {BRAND.name} never moves money and never asks for a card or a bank
                  login. It only records that the money changed hands.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h3 className="s-h3">The owner checks them off</h3>
                <p className="s-prose">
                  Each person&apos;s share gets its own checkbox. When the last one is checked, the bill reads Paid. If your house
                  turns on thank-you receipts, the person who paid gets a short confirmation.
                </p>
              </div>
              <div className="s-step-aside">Payment recorded: Electric</div>
            </li>
            <li>
              <div>
                <h3 className="s-h3">Reminders cover the rest</h3>
                <p className="s-prose">
                  A heads-up a week before the due date, one reminder a day for the last three days, then one every three days
                  while it&apos;s overdue. Your house sets the hour and both windows, and can turn reminders off.
                </p>
              </div>
              <div className="s-step-aside">Due soon: your Electric share</div>
            </li>
          </ol>
        </div>
      </section>

      <section className="s-section" aria-labelledby="modes-title">
        <div className="s-wrap">
          <div className="s-section-head">
            <h2 className="s-h2" id="modes-title">
              Two ways to run a house
            </h2>
            <p className="s-prose">
              It&apos;s a setting, not a commitment. Switching changes who new bills go to and how the dashboard talks about them.
              Bills already posted stay exactly as they were.
            </p>
          </div>
          <div className="s-pair">
            <div>
              <h3 className="s-h3">One person pays everything</h3>
              <p className="s-prose">
                One roommate has every account and everyone pays them back. The dashboard just says what you owe and when it&apos;s
                due.
              </p>
            </div>
            <div>
              <h3 className="s-h3">Each bill has its own owner</h3>
              <p className="s-prose">
                Electric is in one name and the wifi in another. Everyone owes on the bills they don&apos;t front, and the dashboard
                shows who owes whom across the house.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="details-title">
        <div className="s-wrap">
          <div className="s-section-head">
            <h2 className="s-h2" id="details-title">
              The details that save an argument
            </h2>
          </div>
          <dl className="s-defs">
            <div>
              <dt>Shares are set when a bill is posted</dt>
              <dd>Whoever splits bills at that moment is on it. A roommate who moves in next month never owes on this month&apos;s gas.</dd>
            </div>
            <div>
              <dt>Statements stay on file</dt>
              <dd>Each bill keeps the provider&apos;s PDF, and the lease and other paperwork can live in the house&apos;s documents.</dd>
            </div>
            <div>
              <dt>Your own calendar feed</dt>
              <dd>Subscribe once in Apple or Google Calendar, and every due date shows up, worded for you.</dd>
            </div>
            <div>
              <dt>Invite by email</dt>
              <dd>An admin adds roommates by address. They sign in with a code sent to that address, so there&apos;s no password to share.</dd>
            </div>
            <div>
              <dt>Admins and members</dt>
              <dd>Admins run the house. Members see everything and can post and check off the bills they own.</dd>
            </div>
            <div>
              <dt>Spending over time</dt>
              <dd>A chart of each bill month by month, and a CSV of the whole history whenever you want it.</dd>
            </div>
            <div>
              <dt>Two looks for your house</dt>
              <dd>A crisp bank-statement style with a dark mode, or a warm peach one with a striped awning. Your house picks.</dd>
            </div>
            <div>
              <dt>More than one household</dt>
              <dd>Moved out, or splitting a summer place too? One account can belong to several households and switch between them.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="s-close" aria-labelledby="close-title">
        <div className="s-wrap">
          <div className="s-close-panel">
            <div>
              <h2 className="s-h2" id="close-title">
                Try it on your own house.
              </h2>
              <p className="s-prose">Free, with no ads and no card. Or open the demo household and click around first.</p>
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
