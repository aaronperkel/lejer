# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lejer (lejer.app): a hosted, multi-tenant Next.js 16 (App Router) + TypeScript + Tailwind v4
app for splitting household bills. Households sign up, invite roommates by email, post bills,
track who owes whom, and get reminder emails. It merges two earlier single-household apps that
share a lineage — `../utilities` (77 N Union, one person pays everything) and `../peach-cob`
(404 Parke Ave, each bill type has an owner who fronts it). When behavior is ambiguous, those
repos are the ground truth for intent; `ARCHITECTURE.md` (formerly `DESIGN.md`) records every decision made in the merge,
including a table of places the two apps disagreed and which way Lejer went.

**One data model, two modes.** Every bill type has an `owner_id`; posting a bill snapshots it
into `bills.owner_id`, and debts on a bill run to **the bill's** owner (reassigning a type only
changes who owns new bills). `households.mode` is `single_payer` (every type owned by the same person; UI hides the
owner column, dashboard says "you owe") or `ledger` (types carry their own owners, dashboard
shows who-owes-whom). Mode is a setting that drives defaults and copy; switching never
migrates data.

**`DESIGN.md` is reserved** for the Impeccable design skill (visual design context). Engineering
decisions go in `ARCHITECTURE.md`.

**Brand.** "Lejer" / lejer.app is the working name and may change before launch. The name,
domain, app URL, mail subdomain and From addresses, and cookie names live in `lib/brand.ts`;
code and email templates read `BRAND` / `appUrl()` and never spell them out (the `brand`
verify suite fails on a stray literal). These docs keep saying "Lejer". Renaming changes the
cookie names, which signs everyone out once (accepted). Infrastructure identifiers (the
`lejer_app` Postgres role, the Neon/Vercel project names, the npm package) are not brand and
change only by migration.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build + typecheck — gate 1
npm run verify           # scripts/verify suites against the Neon dev branch — gate 2
npm run verify -- rls    # …or just the named suites
npm run start            # serve the production build
npm run migrate          # apply db/migrations/*.sql in order (owner role, DATABASE_URL_ADMIN)
npm run migrate -- --seed  # …then reset the two dev households from db/seed.sql
npm run email:dev        # React Email preview server for emails/*.tsx (port 3001)
npm run send-reminders -- --household <slug>   # run one household's reminder batch from the CLI
npm run import-tidb      # one-time TiDB → Neon import of the two legacy households (see ARCHITECTURE.md §11)
```

Two gates, in order: `npm run build` (typecheck + build), then `npm run verify`. `verify`
runs every suite in `scripts/verify/` against the **dev** branch only: it refuses unless
`DATABASE_URL_ADMIN` is dev's direct host and `DATABASE_URL` dev's pooled host, and then
checks that each connection reports dev's `neon.branch_id`. Suites build their own
throwaway households (`verify-<run>-*`, users `@verify.invalid`) and delete them, sweeping
leftovers from crashed runs first, so they never depend on or disturb the seed data. **Every
phase adds its checks there** (a new `scripts/verify/<suite>.ts` registered in `index.ts`).
Suites: `brand`, `tokens` (`lib/theme-tokens.ts` against `globals.css`'s statement, statement-dark
and peach blocks, `DESIGN.md`'s frontmatter and `.impeccable/design.json`, series colors included;
peach's faces `preload: false`; no color literals in `emails/`), `emails` (every template renders with its `PreviewProps`), `rls`, `identity`, `bills` (library level, real fixture contexts via
`ctxFor()`), `cron`, `edits` (the new-bill email queue, edit/delete over the frozen split set,
the paid lock, `netPairs`), `features` (mode switch, settings persistence, gating, trends math, calendar
contents), `http` (starts `next start` on gate 1's build, refusing a build older than the
sources; fixed port 4317 or `VERIFY_PORT`, in its own process group, pid in the gitignored
`.verify/server.json`: a run that died without cleaning up is found and its server group
killed on the next run, and a `next` process still holding the port is freed, while anything
else on the port makes verify refuse rather than kill it; mints sessions with `SESSION_SECRET`; forces console mail; drives server actions the
way the client does: plain forms as `$ACTION_ID_<id>` posts, `useActionState`/direct calls with
a `Next-Action` header and React's `encodeReply` body, referenced `_1_*` fields **before** the
root `"0"`). Suites write real blobs, so `verify` also refuses unless `BLOB_READ_WRITE_TOKEN`
belongs to lejer-blob (the store id is embedded in the token), and its sweep deletes each
fixture household's `h/{id}/` prefix **before** its rows, so a crashed run is cleaned up by the
next one.
`npx tsc --noEmit` typechecks alone.

## Configuration

Env lives in `.env.local` (see `.env.example`). Keys:

- `DATABASE_URL` — Neon **pooled** URL for the `lejer_app` role (RLS enforced). All app code.
- `DATABASE_URL_ADMIN` — Neon **unpooled** URL for `neondb_owner` (table owner, so RLS does
  not apply to it). Only five call sites may use it: `scripts/migrate.ts`,
  `scripts/import-tidb.ts`, `createHousehold()` in `lib/households.ts`, the household
  enumeration in `lib/cron.ts` (behind `app/api/cron/tick`), and the slug lookup in
  `scripts/send-reminders.ts`.
  Anything else reading it is a bug, except `scripts/verify/` (dev-only, guarded; it needs the
  owner to build fixtures and inspect the catalog).
- `SESSION_SECRET` — jose HS256 key for the `lejer_session` cookie.
- `RESEND_API_KEY` — sends from `login@mail.lejer.app` (codes, invites) and
  `notify@mail.lejer.app` (household mail). Resend is set up directly at resend.com, not
  through the Vercel marketplace. **Empty outside production = console mode**: `sendMail()`
  prints the message (login codes included) with a `[mail:console]` prefix instead of sending,
  and writes no `email_log` row. In production (`VERCEL_ENV=production`) there is no fallback:
  `instrumentation.ts` refuses to boot without the key, so codes can never land in logs.
- `RESEND_TEST_SENDER` — `1` sends every message from `onboarding@resend.dev` (display name
  kept) until `mail.lejer.app` verifies; set in Vercel's Development env, ignored in
  production. Resend's test sender **only delivers to the Resend account owner's address**, so
  login codes or invites for anyone else (seed users, invitees) need console mode (empty key)
  or the verified domain.
- `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` — the environment's **private** Blob store: lejer-blob
  for development and preview, a separate store for production (Deployment, below). On Vercel
  the SDK uses OIDC; the token is needed locally, for client-upload token minting, and for the
  import script.
- `CRON_SECRET` — bearer token for `/api/cron/tick`; must match the GitHub Actions repo secret.
- `NEXT_PUBLIC_APP_URL` — `https://lejer.app`; used for absolute links in email and `/cal.ics`.
- `APP_DEV_USER` + `APP_DEV_HOUSEHOLD` — bypass login as that email (both must be set); the
  slug is where "Sign in" lands, while pages still show the household their URL names.
  Honored only when `VERCEL_ENV !== "production"` (local + preview). There is no passphrase
  login and no `APP_DEMO_MODE`; the demo is the `/demo` household URL.

**Recovering `.env.local` on a new machine.** The Vercel project's **Development** environment
holds the dev values (Neon `dev` branch URLs, `SESSION_SECRET`, `CRON_SECRET`, the Blob
token and store id), so:

```bash
vercel link --yes --project lejer --scope aaronperkel
vercel env pull .env.local          # Development environment
```

Keys that are empty locally (`RESEND_API_KEY` until it exists, `APP_DEV_*`) are not stored
there; add them by hand. `vercel link`/`env pull` rewrite the whole file (comments are lost;
`.env.example` documents the keys) and add `VERCEL_OIDC_TOKEN`. If the Development values are
ever lost too, reset `lejer_app`'s password on the **dev** branch only (owner connection to
the dev endpoint, `ALTER ROLE lejer_app WITH PASSWORD …`), rebuild the URLs, and push them back
with `vercel env add <KEY> development`. Each Neon branch has its own `lejer_app` password, so
resetting dev's never touches production.

## Architecture

### Request context and tenancy

**Every household lives at its own URL** (ARCHITECTURE.md §5 "Household URLs"): `/` is the
public site for everyone, `/{slug}` a household's dashboard and `/{slug}/portal`, `/trends`,
`/documents`, `/welcome` its pages; `/login`, `/new` (onboarding), `/households` and
`/account` sit outside any household. `lib/paths.ts` holds `householdPath(h, path)` (build
every household link and redirect with it), `householdSlugOf()` and `RESERVED_SLUGS`: a new
top-level route needs its name reserved first (the identity suite checks).

`lib/context.ts` `getCtx()` (React `cache()`, once per request) turns the URL's household plus
the session into `{ user, membership, household, demo }` or `null`. `proxy.ts` reads the slug
off the path and passes it in the `x-household` request header (any client-sent copy is
dropped); `getCtx()` looks it up under `withUser`, so no membership means no ctx, and opening a
pending invite's household accepts it. `/demo…` is the in-memory demo for anyone. Routes whose
URL has no slug (`/files`, the document upload handshake, `/account`'s calendar reset) use
`getCtxForHousehold(id)` with the id the key or form names. It replaces the old
`getCurrentPerson()`.

**No tenant query runs outside `withHousehold`.** `lib/db.ts` exports:

- `withHousehold(ctx, tx => …)` — `sql.begin` that first runs
  `set_config('app.household_id', …, true)` and `set_config('app.user_id', …, true)`, then your
  callback. Pages open one per request and pass `tx` into every `lib/*` data function (they all
  take `tx` first).
- `withUser(userId, tx => …)` — sets only `app.user_id` (`null` before login, e.g. looking up
  the email being verified); for `users`/`login_codes` and the household switcher.
- `adminSql()` — the owner connection, created on first call. See the five allowed call sites
  above.

Clients are created lazily, so importing `lib/db.ts` needs no credentials (the build, scripts).

The raw `sql` client is not exported. If you find yourself importing `postgres` outside
`lib/db.ts`, stop. The one exception is `scripts/verify/harness.ts`, whose RLS probes need raw
transactions with and without GUCs on pooled and direct connections.

**Row-level security is the second lock.** Every household table has `ENABLE ROW LEVEL
SECURITY` — deliberately **not** `FORCE`, so the table owner (`neondb_owner`) is exempt and
`lejer_app` (`NOBYPASSRLS`) is enforced — with policies on
`household_id = app_household_id()`, where `app_household_id()` is
`NULLIF(current_setting('app.household_id', true), '')::int` — the `NULLIF` matters because
a finished `SET LOCAL` leaves `''` on a pooled connection and `''::int` throws. Missing
setting → NULL → zero rows, zero writes. `memberships` and `households` have a wider
**SELECT** policy (rows where `user_id = app_user_id()` / households the user belongs to) so
the switcher can list names; their write policies are household-only. `users` and
`login_codes` have no RLS. `email_log` is the exception to the tenant policy: inserts accept
`household_id IS NULL` (login codes), reads are household-only, there is no UPDATE/DELETE
policy, and account-wide counts go through `email_sends_since(since, kind?)` — a
`SECURITY DEFINER` function that returns only a number, executable by `lejer_app` alone.
Never `INSERT … RETURNING` a NULL-household `email_log` row: `RETURNING` must pass the SELECT
policy, so it fails. The calendar feed has no session, so `calendar_context(token)` (same
`SECURITY DEFINER` hardening) maps a membership's `calendar_token` to
`(household_id, membership_id)` and nothing else; the feed then runs inside `withHousehold`.

**Neon pooling rules** (the pooled endpoint is PgBouncer in transaction mode): never session
`SET`, only `set_config(..., true)` / `SET LOCAL` inside a transaction; `prepare: false` in the
postgres.js options is mandatory; keep transactions short; no `LISTEN`, no session advisory
locks, no temp tables.

### Database

postgres.js (raw SQL, no ORM) with type parsers so `DATE` columns are `YYYY-MM-DD` strings and
`NUMERIC`/`COUNT(*)` are numbers — the Postgres equivalent of the old mysql2 `dateStrings` +
`decimalNumbers`. `TIMESTAMPTZ` stays a `Date`. Schema lives in `db/migrations/` (numbered SQL,
applied by `scripts/migrate.ts`, tracked in `schema_migrations`). `db/seed.sql` seeds one
household of each mode.

Tables (all tenant tables carry `household_id`; children also have composite FKs
`(parent_id, household_id)` so a child can never point across households):

- `households` — settings row: `mode`, `theme` (`statement`|`peach`), `color_scheme`,
  `timezone`, `ask_bill_date`, `bills_per_page`, `feature_*` booleans (rent, trends,
  bulk_email, documents, welcome_tour, thanks), rent columns, reminder schedule
  (`reminders_enabled`, `send_hour` in the household's tz, `first_reminder_days`,
  `urgent_reminder_days`) and cron bookkeeping (`last_run_at`, `last_send_date`,
  `last_sent_at`, `last_sent_count`), email identity (`from_name`, `reply_to`, `digest_email`)
- `users` (`email` citext unique = login identity, `name`) — global
- `memberships` (`household_id`, `user_id`, `role` `admin`|`member`, `splits_bills`,
  `welcomed_at`, `invited_by`, `joined_at` NULL until first sign-in, `calendar_token` 32 random
  bytes base64url, unique, generated on insert, reset with `SET calendar_token = DEFAULT`) —
  everything per-person per-household hangs off `memberships.id`, not `users.id`
- `bill_types` (`name` unique per household, `emoji`, `processing_fee`, `owner_id` →
  memberships, SET NULL on delete)
- `bills` (`type_id` RESTRICT, `bill_date`, `due_date`, `total`, `per_person_cost`, `status`
  `unpaid`|`paid` as a CHECK, `pdf_path`, `added_by_id`, `owner_id` → memberships SET NULL +
  `had_owner`, both set at post time from the type's owner, 0004; `fee`, `shares`,
  `owner_share`, the frozen split, and `notice_kind`/`notice_queued_at`/`notice_extra`/
  `notified_at`, the new-bill email queue, 0005). The ledger, balances,
  reminders' Reply-To and permission checks on an existing bill (`assertCanManage(ctx,
  bill.ownerId)`) all use the bill's owner; `assertBillManager(tx, ctx, typeId)` (the type's
  current owner) only gates posting new bills. A removed owner reads as `FORMER_MEMBER`
  ("former member"); a bill posted for an ownerless type is owed to "the house"
- `bill_debts` (`bill_id`, `person_id`, `paid_at`) — the bill's debtor set, **written once when
  the bill is posted** (0003) and rebuilt only by an edit before anyone has paid, over the same
  frozen split set (0005). Paying sets `paid_at`, un-paying clears it, so
  unchecking restores exactly the original debtor and late joiners never get rows on old bills.
  The owner never gets a row. A bill is `paid` when no row has `paid_at IS NULL`; `setPaid` and
  `refreshBillStatus` keep `bills.status` in step transactionally (also after a member removal
  cascades their rows). Everything "still owed" filters `paid_at IS NULL`
- `payment_thanks` — debounced thank-you receipts (`lib/thanks.ts`), only when `feature_thanks`
- `documents` (`file_path` always under `h/{id}/documents/`, `uploaded_by` SET NULL)
- `login_codes` (`email` citext, `code_hash`, `attempts`, `ip_hash`, `created_at`, `expires_at`) —
  keyed by the normalized email, not `users.id`: requesting a code never creates a user
- `email_log` (`household_id` nullable, `kind`, `to_hash`, `ok`, `sent_at`) — every send;
  source of truth for the daily budget (via `email_sends_since()`) and the portal readouts

Bill math: `total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)`
where splitters are memberships with `splits_bills`; debt rows for every splitter except the
owner. `getOwedPairs(tx)` in `lib/bills.ts` is the who-owes-whom ledger and works in both
modes. It stays gross everywhere; the dashboard's `ledgerGroups()` pairs up two people who
owe each other and adds a muted "Settling at once?" hint with the net from `netPairs()`, never
a net figure as the primary number.
SQL aliases snake_case to camelCase (`per_person_cost AS perPersonCost`); bill queries
join `bill_types` and the bill's owner/poster memberships so each `Bill` carries
`typeName`/`typeEmoji`/`ownerId`/`ownerName`/`addedByName`.

**Fixing a posted bill** (0005, ARCHITECTURE.md §3). Posting queues the new-bill email on the
bill row (`lib/notices.ts`, `NOTICE_DELAY_MINUTES` = 10 in `lib/notice-delay.ts`); the cron
tick and every bill mutation's `after()` flush what has waited out the window. Until any debt
row has `paid_at`, the bill's owner or an admin can `updateBill` (recomputes over the bill's
frozen `shares` and never consults today's splitters; a type change re-snapshots the owner
inside the same set) or `deleteBill` (its PDF is deleted after commit). An edit still inside
the window restarts it; one after the email went out queues a single "Corrected" email to
everyone on the bill before or after the edit plus both owners. Deleting an already-emailed
bill sends a "Bill removed" note right away.

### Auth flow

`proxy.ts` requires a valid `lejer_session` cookie for everything except `/login`, `/demo…`,
`/cal.ics`, `/api/cron`, `/api/documents/upload`, the public site (`/`, `/how-it-works`,
`/about`, any method, since the home page's sign-up form posts back to `/`), icons and static
assets; non-GET without one gets 401, GET redirects to `/login?next=`; the 30-day session
cookie is re-issued once a week old. The session JWT is identity only, `{ uid }` (audience
`session`; older tokens' `hid` is ignored). On a signed-in GET of a household page the proxy
also sets `lejer_household` (the slug; a preference, not a credential), which `homePath()` in
`lib/context.ts` uses: the last household opened, else the first joined, else `/new`. `next=`
goes through `safeNext()` (`lib/flash.ts`), which rejects `//host` and `/\host`.

The flow is a normal product site's: `/` is the landing page signed in or not (its header
says "Open your household" to someone signed in); `GET /login` while signed in redirects to
`next=` or `homePath()` (except on the code step, so you can sign in as another address);
signing out lands on `/`. `getSessionUser()` serves pages that need the user but no household
(`/new`, `/households`, `/account`).

`/login` is the same two-step form as before: email → 6-digit code → session. Differences:
an unknown email still gets a code (anyone can sign up) and the request writes nothing to
`users`; a verified code creates the `users` row with a placeholder name from the email's
local part, and first-timers land on onboarding (`/new`: their real name first, then
household name, mode, theme, timezone), which calls `createHousehold()` (slug from the name,
`-2` and up on a collision or a reserved name) and sets `ask_bill_date` from the mode, then
opens `/{slug}/portal/household` to invite people. A returning user goes to `next=`, else
the newest invite, else `homePath()`. Every email is normalized once (`normalizeEmail()`: trim +
lowercase) and the column is citext, so all per-email caps key on one spelling. Codes: sha256
at rest, 10-minute TTL, 5 wrong guesses, 30 s burst dedupe, 5 per email per 10 min, 10 per IP
per hour (`ip_hash`), and a global 40 per UTC day from `email_sends_since(…, 'login_code')`,
which reserves Resend headroom for household mail. A send that fails releases its code.
Verifying also accepts every pending invite (`joined_at`), one `withHousehold` per household,
since `memberships_write` only admits the current one.

**Library mutations take `ctx` and authorize themselves** (`assertAdmin(ctx)`,
`assertBillManager(tx, ctx, typeId)` in `lib/auth.ts`), throwing `ActionError` (`lib/errors.ts`)
for anything the person should be told; actions turn it into `?err=` or an inline error, and
anything else propagates as a bug. Pages read through one loader each in `lib/views.ts`, which
is where the `ctx.demo` branch lives.

**Page-level authorization** is `requireUser()` (no ctx → not-found if signed in, so a slug
never confirms a household exists, else `/login`) / `requireAdmin()` (`/{slug}/no-access`) in
`lib/auth.ts`, and `requireUserAction()` /
`requireAdminAction()` / `requireBillManager(tx, typeId)` for server actions (throw). Every
action authorizes itself; `proxy.ts` is only the first lock. A `member` can read everything
(including `/portal/household`, read-only) and, for types they own, post bills and mark
payments. `admin` does everything. The last **joined** admin can't be demoted, and nobody can
remove themselves. Invites are memberships with `joined_at NULL` plus a `users` row created up
front (an admin vouched for the address; the typed name only applies if the person is new);
the code login proves address ownership, so there is no invite-token table. Names live on
`users` and are shared across households, so only their owner edits them (`/account`).

Switcher: `/households` lists the user's memberships as links to each household's URL. Nav
shows the household name and a dropdown of links only when there is more than one; two
households can be open in two tabs.

Demo: `/demo` is the in-memory ledger household from `lib/demo.ts` at its own URL, for anyone,
with no cookie; `withHousehold` throws on a demo scope, and actions refuse with
`DEMO_REFUSAL`. A signed-in visitor sees it there too and their own household stays at its
own URL.

### Stored files

Private Blob storage, one store per environment class (lejer-blob for dev/preview, its own
store for production; household ids come from different databases, so the two must never
share a store). Keys (`lib/blob.ts`): bill PDFs
`h/{household_id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf` (MMDD from the bill date; the
bill id keeps same-day bills apart; `allowOverwrite: true`; the upload's own filename is ignored
because providers reuse one name per statement; `addBill` reserves the id with `prepareBill`,
uploads, then inserts); documents
`h/{household_id}/documents/{slug}-{suffix}.{ext}` (`addRandomSuffix: true`).

`app/files/[...path]/route.ts` is the only read path: resolves the ctx of the household the key
names (`h/{id}/`, `getCtxForHousehold`; no membership → 404), rejects keys not under
`h/{ctx.household.id}/`, then confirms the key exists in `bills.pdf_path` or
`documents.file_path` **inside `withHousehold`** (RLS as the second lock), applies the extension
allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG) + `nosniff`, and streams `get()`.

Bill PDFs go through the `addBill` server action (4 MB `bodySizeLimit` under Vercel's 4.5 MB
cap, optional). Documents upload client-direct via `handleUpload` in
`app/api/documents/upload/route.ts`, which gates on admin of the household the pathname names
(`getCtxForHousehold`) and **refuses** any pathname outside that household's documents prefix (the client token is bound to the requested
pathname and can't be rewritten; the page passes the prefix to the form); `onUploadCompleted` is intentionally a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting.

### Email

`lib/mail.ts` wraps Resend: `sendMail({ ctx?, to, subject, react, replyTo?, kind })` returns
`false` on failure (logged, not thrown) and writes one `email_log` row per attempt (except in
console mode), in its own short transaction after the send, without `RETURNING`. `ctx` logs
the row under that household; without it the row is `household_id NULL`. From is
`"{from_name ?? household name} via Lejer" <notify@mail.lejer.app>`; Reply-To is
`households.reply_to`, except reminder and new-bill emails use the bill owner's email.
Login codes and invites come from `"Lejer" <login@mail.lejer.app>` with no Reply-To.

New-bill mail (`lib/notices.ts`, queued) and reminder mail (`lib/notify.ts`) go only to members who have **joined**: a
pending invite's address isn't proven, so it gets nothing but the invite. Reminders are urgent
within the household's `urgent_reminder_days`, counted in its own calendar (`lib/time.ts`).

Templates are React Email components in `emails/`, all wrapped in `emails/Shell.tsx`, which
renders the statement or peach shell from `households.theme` (inline styles only, light-only,
560 px). Copy is gender-neutral; the noun ("statement"/"ledger") follows the theme.

### Cron

`app/api/cron/tick/route.ts` (bearer `CRON_SECRET`, timing-safe; 500 without a server secret,
401 for a missing or wrong header; `maxDuration = 120`) calls `tick()` in `lib/cron.ts`, which
enumerates households with `adminSql` and runs `tickHousehold()` for each with a system scope
(`user: null`), in **short** transactions only: reads and stamps, never a send inside one. Per
household: stamp `last_run_at`; flush the thanks queue (`lib/thanks.ts`, own 10-minute debounce,
every tick, if `feature_thanks`; payment edits also flush via `after()`) and the new-bill email
queue (`lib/notices.ts`, every tick, never deferred); then, on the first tick
at or after `send_hour` in the household's timezone, **claim the day** atomically (`last_send_date
< today`, never `!=`), check the account-wide UTC-day budget (`email_sends_since()`, batch plus
confirmation copy past 80 → release and **defer**), and send. A batch where every send failed
releases its claim. Releases are compare-and-set (`WHERE last_send_date = <the date this tick
claimed>`), so a slow failing tick can't clobber a later success. Who gets what is
`lib/reminders.ts`: heads-up at exactly `first_reminder_days`, urgent daily from
`urgent_reminder_days` through the due date, then every `OVERDUE_EVERY_DAYS` (3) once overdue
(overdue days 1, 4, 7, …). `scripts/send-reminders.ts` runs the same per-household tick for one
slug, ignoring `send_hour` (`--force` also skips the claim and budget). Bulk email
(`/portal/email`) refuses past **60** sends for the day, leaving room for reminders and codes.
Verify never ticks the seed households: `tick({ only })` takes fixture ids, and every library-level
send goes through an injected recorder (`.env.local` may hold a real `RESEND_API_KEY`).

Scheduler is `.github/workflows/tick.yml` pinging hourly; Vercel Hobby crons run once a day,
which would defeat the portal-configurable send hour. GitHub drops delayed runs, which the
"at or after, once per day" rule tolerates. The workflow is committed inactive: its job runs only once the repo
variable `TICK_URL` is set (cutover), and it reads the secret `CRON_SECRET`.

### Key surfaces

- **Three root layouts.** A household's pages live in `app/(household)/[household]/` under its
  own root layout (re-rendered whenever the slug changes, since the theme sits on `<html>` and a
  shared root layout survives client navigations); the pages outside a household (`new`,
  `households`, `account`) live in `app/(app)/`; both roots render
  `app/components/AppShell.tsx` (nav, theme, fonts, demo banner). The public site, `/login`
  included, lives in `app/(site)/` under its own root. URLs don't include groups, so paths below like
  `app/portal/` mean `app/(household)/[household]/portal/`, served at `/{slug}/portal`.
  Crossing between roots is a full page load, so no `<html>` leaks into another.
  `app/global-not-found.tsx` (experimental `globalNotFound`) is the 404 for unmatched URLs,
  since no single layout covers them; `app/metadata.ts` holds the metadata the roots share
- `app/(site)/` — the public site (`lib/site.ts`): home at `/` for everyone, `/how-it-works`,
  `/about`, and `/login`. Its look is its own (`site.css` on
  `html[data-site]`: a drafting sheet, Archivo + Martian Mono, the four utility-locate colors;
  DESIGN.md "Public Site"), not either household theme. `FloorPlan.tsx` is the interactive
  sample household from `lib/demo.ts`; the sign-up form is the real `requestCode` action. The
  site root has no `loading.tsx`, so `/login`'s signed-in `redirect()` is a real 307
- `app/page.tsx` (`/{slug}`) — dashboard: mode-aware summary strip (you owe / next due / bills on record),
  house ledger (hidden in single-payer when the viewer is the payer), bills grouped by year,
  calendar subscribe buttons
- `app/portal/` — `/portal` bills (add-bill disclosure honoring `ask_bill_date`, payment
  checkboxes, per-bill reminders, the edit/delete dialog while nobody has paid), `/portal/household` members (invite/edit/remove) + bill
  types (owner column in ledger mode), `/portal/settings` (features, theme, reminders,
  timezone, email identity, rent, mode switch), `/portal/email` bulk email (feature-gated).
  All mutations are server actions (portal ones in `app/portal/actions.ts`); flash messages
  travel as `?ok=`/`?err=` query params via `done()`/`fail()` in `lib/flash.ts` (plain
  functions, so they aren't exposed as actions), rendered by `app/components/Flash.tsx`
- `app/documents/` — household paperwork (feature-gated); everyone reads, admins manage
- `app/trends/` — Chart.js line per bill type (series slots from `--series-N`, HTML legend
  toggles, rebuilt on theme/scheme change), totals table, CSV of the whole history at
  `/trends/csv` (feature-gated; `lib/trends.ts` is pure, so the demo shares it)
- `app/welcome/` — the animated tour (feature-gated), told for the household's mode; the
  dashboard sends each member there once (`welcomed_at`)
- `app/(app)/new/` — the onboarding wizard (`/new`) for a new user or a new household
- `app/(app)/households/` — every household you're in, linked by URL (+ "start a new household")
- `app/(app)/account/` — your name (all households) and a calendar link per joined household
- `app/(site)/login/` — the code flow in the site's look, since most sign-ins start at the
  home page's form (redirects a signed-in visitor to their household), and `signOut` (back
  to `/`)
- `/demo` — not a folder: the `[household]` routes serve the in-memory household in
  `lib/demo.ts` for the `demo` slug; data functions branch on `ctx.demo`, mutations refuse
  politely
- `app/cal.ics/route.ts` — public iCal feed per membership (`/cal.ics?k=<calendar_token>`, no
  household param), resolved through `calendar_context()` and built by `lib/ics.ts` inside
  `withHousehold` (events worded for the token's owner, rent RRULE only with `feature_rent`);
  removing the membership kills the feed, "reset my calendar link" issues a new token, and
  every bad token gets the same empty 404. Subscribe buttons: `app/components/CalendarLinks.tsx`
- `lib/features.ts` — the one place features are asked about: `hasFeature`, `requireFeature`
  (pages: not-found), `assertFeature` (actions), `navLinks` (the header)
- `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx` — `next/og` at build time
  from `BRAND` and the theme tokens (`lib/mark.tsx` holds the stand-in mark and the font loader)

### Styling

Tailwind v4, CSS-first config in `app/globals.css`. Raw values live on `:root` (the
"statement" theme: paper ledger, one accent blue, IBM Plex Mono as the ledger face) and are
mapped to utilities in `@theme inline`; `:root[data-theme="peach"]` overrides them with the
peach awning theme (cream/espresso/deep peach, Fraunces display, Karla body, Courier Prime
ledger, the `.awning` band, radii one step rounder, pill tags). Faces come from `next/font` as
`--nf-*` variables on `<html>` and are picked per theme through `--face-*`; only Plex Mono
preloads. `<html data-theme data-color-scheme>` is set by the app's root layout from the household
(peach always renders `light`). The statement dark block is gated on
`data-color-scheme="system"` and excludes peach. Green/red/amber (sage/rose/butter in peach) are reserved for paid/unpaid/due-soon.
Theme color values have one home, `lib/theme-tokens.ts`: email reads it directly, and the stylesheet
mirrors it under the `tokens` suite, so change the module first. Peach's values there are the
corrected spec from `DESIGN.md` (darker inks than peach-cob, all text ≥ 4.5:1), not
peach-cob's originals. A global `prefers-reduced-motion` rule ends `globals.css`.
Shared component classes (`.panel`, `.eyebrow`, `.figure`, `.btn*`, `.tag*`, `.due-*`,
`.field-*`, `.data-table`, `.tab*`, `.flash*`, `.table-stack*`, `.nav-link`, `.nav-menu*`,
`.dialog`, `.legend-toggle`, `.awning`, `.panel-awning`, `.tour-*`) live in `@layer components` —
Tailwind v4 cannot `@apply` a custom class from the same layer. There is one modal,
`app/components/Dialog.tsx` (a native `<dialog>`: Escape, backdrop, focus back to the opener,
display-face title); form dialogs (bill types, editing a bill) render inside it, and anything
that removes, sends or reassigns asks first through `app/components/ConfirmButton.tsx`, built
on it, never `window.confirm()`. Status reads through `StatusTag` (Paid / Unpaid, red only once
past due) and `DueChip` (server-rendered from the household's today and urgent window).

## Verifying changes locally

Start with the two gates (`npm run build`, `npm run verify`). Pages stream under the root
`loading.tsx`, so `notFound()` renders the not-found UI with a 200 status (the status line has
already gone out); check for the UI, not the code. Dev points at the Neon `dev` branch, not production; `npm run migrate -- --seed` sets it up
(seed users `alex@example.com` / `sam@example.com`, households `elm-street` single-payer and
`oak-lane` ledger, both users in both). Set `APP_DEV_USER` / `APP_DEV_HOUSEHOLD` to skip
login. With `RESEND_API_KEY` empty, login codes print to the dev server's output
(`[mail:console] login_code to …`), so the real login flow works locally for any address.
Server actions can be driven over the wire like a no-JS browser: POST `multipart/form-data` to
the page with a `$ACTION_ID_<id>` field plus the form fields, ids from
`.next/dev/server/server-reference-manifest.json` (`exportedName`); the response is a 303 whose
`Location` carries `?ok=`/`?err=`. To tick the cron
safely, check `households.last_send_date` first; a tick past `send_hour` on a day that hasn't
sent will email real members of every household in that database.

## Deployment

Vercel (Hobby) at lejer.app, Neon (free), two private Blob stores (dev/preview and production),
Resend (free, domain `mail.lejer.app`).

**Neon** is not a Vercel marketplace integration (that integration owns `DATABASE_URL` and
would point it at the owner role, skipping RLS). Project `lejer` (`round-grass-59501457`) in
the Aaron Perkel LLC org, `aws-us-east-1`, Postgres 17; branch `main` is production, `dev` is
local development. `lejer_app` was created with SQL on `main` before `dev` was branched, so
both branches have it, each with its own password (dev's was reset 2026-10-06; set or reset
main's with `ALTER ROLE` when Production env is configured):

```sql
CREATE ROLE lejer_app LOGIN PASSWORD '<openssl rand -base64 24, URL-safe>' NOBYPASSRLS;
```

Never create it in the console (console roles join `neon_superuser`). `0001_init.sql` refuses
to run if the role is missing or can bypass RLS. Drop `channel_binding` from Neon's
connection strings; postgres.js would forward it as a startup parameter.

**Vercel** project `lejer` in the `aaronperkel` (Hobby) scope, linked with the CLI, no Git
connection yet. Blob store `lejer-blob` (`store_kmuAqgMI8w1nbg75`, private, `iad1`) was
created with `vercel blob create-store` and is **dev/preview only, permanently**: connected to
Development now, to Preview when Preview is configured, **never to Production**. Keys are
`h/{household_id}/…` and dev/preview household ids come from the Neon `dev` branch, so sharing
a store with production would let dev overwrite prod files and let `npm run verify`'s
prefix sweep delete them. Production gets its **own** private store, created at cutover
(ARCHITECTURE.md §11 checklist); `verify` keeps pinning lejer-blob by the store id embedded
in the token, so it can never run against the production store. Resend is a
direct resend.com account, not a marketplace integration.

**Vercel env vars, set by hand** in the project. Development holds the dev-branch values
(the `.env.local` recovery path above). Production (uses `main`) and Preview (may use `dev`
or its own branch) are **not set yet**:

| Var | Value |
|---|---|
| `DATABASE_URL` | `lejer_app` on the `main` **pooled** host (`…-pooler…`), `?sslmode=require` |
| `DATABASE_URL_ADMIN` | `neondb_owner` on the `main` **unpooled** host, `?sslmode=require` |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | from the resend.com dashboard (API Keys) |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | Production: the production store, created at cutover (connecting it sets the token). Development/Preview: lejer-blob, `store_kmuAqgMI8w1nbg75` |
| `CRON_SECRET` | random; also the GitHub Actions repo secret |
| `NEXT_PUBLIC_APP_URL` | `https://lejer.app` |

`APP_DEV_USER` / `APP_DEV_HOUSEHOLD` are never set in Production (and are ignored there).
Run `npm run migrate` against `main` with its `DATABASE_URL_ADMIN` before the first deploy
and after every new migration. Free-tier ceilings and where they bite first are in `ARCHITECTURE.md` §10 — the two to
respect are Neon's 100 CU-hours (never ping more than hourly) and Resend's 100 emails/day
(the cron budget and login-code caps exist for this).
