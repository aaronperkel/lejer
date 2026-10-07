# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

College-age and young-adult roommates splitting shared utility bills (gas, electric, internet,
water, phone, and optionally rent). Most of them aren't technical. They open Lejer **on a
phone, about once a month**, when a bill lands or a reminder email arrives, so every visit
starts cold: nobody remembers last month's screen.

Core jobs:

1. See what I owe, and to whom.
2. Check off that I paid.
3. Post a bill with its PDF.

There are two roles, and the product serves them **equally**:

- **The person who fronts a bill**, either the household's single payer or the owner of a bill
  type. They set up the household, invite roommates by email, post each statement when it
  arrives, check off payments as roommates pay them back, and send reminders.
- **The roommate who owes.** They mostly arrive from an email (a new bill, a reminder) or a
  calendar entry, check what they owe and by when, pay outside the app, and leave.

The same person is often both: in ledger mode, everyone who owns a type fronts it and owes on
the others.

The near-term audience is **open but small, grown by word of mouth**. Anyone can sign up,
`/demo` shows the product without an account, and there is no marketing push and no paid tier.
The first real households are the two legacy ones being imported (77 N Union #3, 404 Parke Ave).

## Product Purpose

Lejer keeps a household's shared bills on record and makes "who owes whom, how much, by when"
obvious, so nobody has to keep a spreadsheet or chase people by text. Success: every bill gets
posted with its statement, every debtor knows what they owe before it's due, and the person
fronting the bill can see at a glance who has settled up.

## Positioning

Lejer is a **ledger of recurring household statements**, not a general expense splitter. Its
building blocks are bills with a statement date, a due date and the provider's PDF on file. Each
bill type has an owner who fronts it, and debts run to that bill's owner. Reminders arrive by
email on the household's own schedule, and each member gets a personal calendar feed of due
dates. **It never moves money.** Paying happens elsewhere (Venmo, cash, bank transfer), and
Lejer records that it happened.

## Operating Context

- **Two modes, one data model.** `single_payer`: one person owns every type and everyone owes
  them, so the UI says "you owe" and hides owner columns. `ledger`: types carry their own owners
  and the dashboard shows who owes whom across the house. Mode is a setting that drives defaults
  and copy, and switching it never migrates data.
- **The monthly ritual.** A provider's statement arrives → the bill's owner posts it (amount,
  optional statement date, optional PDF) → splitters are notified by email → they pay outside
  the app → the owner checks each person off → a debounced thank-you receipt goes out
  (`feature_thanks`) → reminders go out ahead of the due date: a heads-up N days before, then
  urgent within M days, overdue included.
- **Surfaces:** the dashboard (what you owe, next due, the house ledger, bills by year); the portal
  (bills, household members and bill types, settings, bulk email); documents (lease and other
  paperwork); trends (spending per type, CSV); onboarding and a welcome tour; a household
  switcher; account; email-code login; and `/demo`.
- **Email is a primary surface.** Login codes, invites, new-bill notices, reminders, thank-yous
  and bulk mail all arrive in the inbox. Many visits start from an email link.
- **Per-household settings** cover features, timezone, the reminder send hour and windows, email
  identity (from name, reply-to, digest copy), rent, and the mode itself.

## Capabilities and Constraints

- **Roles:** `admin` does everything. A `member` reads everything and, for types they own, posts
  bills and marks payments. Invites are pending memberships, and an address gets nothing but the
  invite until its owner signs in.
- **Bill math:** `total = amount + processing_fee`, and `per_person_cost = round(total /
  splitters, 2)`. The owner counts in the denominator but owes nothing. Each bill's debtor set is
  fixed when it's posted, so late joiners never owe on old bills.
- **Terminology:** household, member, bill, bill type, owner (the person fronting a type or
  bill), splitter, "you owe" / "owed to you", "settled up", "former member" (a removed owner),
  "the house" (a bill whose type has no owner). Copy is gender-neutral (they/them). The noun for
  the record follows the household's theme: "statement" or "ledger".
- **Hard limits, all free tiers:** Resend allows 100 emails per day account-wide, so the cron
  defers any reminder batch that would push the day past 80, and login codes are capped at 40 per
  day. Neon allows 100 CU-hours a month, so nothing pings more often than hourly. Vercel Hobby is
  non-commercial. Any feature that sends mail or keeps the database awake has to respect these.
- **Auth:** email plus a 6-digit code only. There are no passwords and no OAuth, and anyone can
  sign up.
- **Privacy:** each household's data is isolated by row-level security, and bill PDFs and
  documents are private, served only to members.
- **Undecided:** the product name. "Lejer" / lejer.app is a working name and may change before
  launch, so it lives only in `lib/brand.ts`. A public landing page doesn't exist yet. `/login`
  and `/demo` are the current front door.

## Brand Commitments

- The name, domain and mail addresses come from `lib/brand.ts`. No surface or email may spell
  them out (the `brand` verify suite enforces this), and the name may change.
- The voice is plain, neutral and friendly, uses they/them, and never assigns genders ("they
  already covered it", not "she"). Copy is specific about money and dates.
- Household mail is sent as "{household} via {name}", so the household's own identity leads and
  Lejer is the carrier.
- **Two deliberate themes share one component set**, and a household picks one. Both are
  intentional, binding parts of the product (user-confirmed 2026-10-06):
  - **statement:** a bank-statement portal. IBM Plex Mono for every number, date and label, one
    accent blue, green/red/amber reserved for paid/unpaid/due-soon, and dark mode support.
  - **peach:** a peach awning over a paper ledger. Fraunces for display, Karla for body text,
    Courier Prime as the ledger voice, a cream/espresso/peach palette with periwinkle,
    sage/rose/butter for status, and a striped awning header with a scalloped hem. Light-only
    on purpose.

  Differences between the themes are design, not inconsistency. Don't "fix" either theme toward
  the other, and don't treat Fraunces or the awning as slop. The full visual system belongs in
  DESIGN.md.

## Evidence on Hand

- **Demo household** (`lib/demo.ts`): an in-memory ledger-mode house with neutral names (Robin,
  Jordan, Casey, Morgan, Kit) and types like Electric and Gas. It's safe for screenshots and
  marketing.
- **Seed data** (`db/seed.sql`): `elm-street` (single-payer) and `oak-lane` (ledger), with users
  alex@ / sam@example.com.
- **Real data** from the two legacy households (utilities: 2 people, 4 types, 13 bills with PDFs
  as of 2026-10-06; peach-cob: size unknown) is private and must never appear in design work or
  marketing.
- **Absent:** there are no testimonials, user counts, press, pricing, or logo or wordmark assets
  (only `app/favicon.ico`). Don't invent them.

## Product Principles

1. **Calm and trustworthy.** This is money between friends who live together. Nothing should
   feel alarming, salesy or flimsy, and the record has to be visibly accurate and permanent.
2. **Money numbers are always legible.** On any screen, the first thing a person can read is
   what they owe or are owed, to whom, and by when, at phone size and in either theme.
3. **One obvious action per screen.** A visitor who opens the app once a month should never
   have to work out what to do next.
4. **Never make someone feel nagged.** Reminders and copy inform without guilt or pressure.
   Every email has to earn its place in the inbox and in the shared daily send limit.
5. **Record, don't transact.** Lejer never moves money or implies that it does. It records what
   was posted and who paid, and serves the person fronting a bill and the roommate who owes
   equally.
