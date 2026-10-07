// Phase 5 (features and themes), library level: switching the household's mode (types follow
// the payer, bills keep the owner they were posted with), settings validation and persistence
// (theme, scheme, features, rent), feature gating (nav links, the thanks queue), the trends
// series and CSV, and the calendar feed's contents. The routes themselves (tokens over the
// wire, not-found pages, the nav in real HTML) are in the http suite.

import { createBill, getBill, getOwedPairs, setPaid } from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { navLinks } from "@/lib/features";
import { buildCalendar, calendarLinks, isCalendarToken } from "@/lib/ics";
import { type SettingsForm, parseSettings, saveSettings, settingsFormFrom } from "@/lib/settings";
import { buildTrends, trendsCsv } from "@/lib/trends";
import { type Results, type Sql, addMember, ctxFor, makeHousehold } from "./harness";

export async function features(r: Results, { owner }: { owner: Sql }) {
  const f = await makeHousehold(owner, "f5", "ledger");
  const other = await makeHousehold(owner, "f5x", "ledger");
  const admin = () => ctxFor(f.admin.userId, f.id);
  const member = () => ctxFor(f.member.userId, f.id);
  const form = async (ctx: Ctx, over: Partial<SettingsForm>): Promise<SettingsForm> => ({ ...settingsFormFrom(ctx.household, f.admin.membershipId), ...over });
  const save = async (ctx: Ctx, over: Partial<SettingsForm>) => withHousehold(ctx, async (tx) => saveSettings(tx, ctx, parseSettings(await form(ctx, over))));
  const refused = async (name: string, fn: () => Promise<unknown>, re = /./) =>
    r.throws(name, async () => {
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof ActionError)) throw new Error(`not an ActionError: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    }, re);
  const typeOwners = async () => new Map((await owner<{ id: number; ownerId: number | null }[]>`SELECT id, owner_id AS "ownerId" FROM bill_types WHERE household_id = ${f.id}`).map((t) => [t.id, t.ownerId]));
  const billOwner = async (id: number) => (await owner<{ o: number | null }[]>`SELECT owner_id AS o FROM bills WHERE id = ${id}`)[0].o;

  // -------------------------------------------------------------------------------------------
  r.section("features: switching the mode");
  // A bill on the member's own type (Water), owed to the member by the admin.
  const water = await withHousehold(await member(), async (tx) => createBill(tx, await member(), { typeId: f.memberTypeId, amount: 60, billDate: "2030-01-01", dueDate: "2030-01-20" }));
  r.check("setup: the Water bill is owned by the member who posted it", (await billOwner(water.billId)) === f.member.membershipId);

  await refused("a member can't switch the mode", async () => save(await member(), { mode: "single_payer", payerId: String(f.member.membershipId) }), /admin/);
  await refused("single payer needs someone to pay", async () => save(await admin(), { mode: "single_payer", payerId: "" }), /who pays/);
  await refused("…and that someone has to be in this household", async () => save(await admin(), { mode: "single_payer", payerId: String(other.admin.membershipId) }), /this household/);
  await refused("the demo can't save settings", async () => saveSettings(null as never, demoCtx(), parseSettings(settingsFormFrom(demoCtx().household, 1))), /demo/);

  const moved = await save(await admin(), { mode: "single_payer", payerId: String(f.admin.membershipId) });
  let owners = await typeOwners();
  r.check("ledger → single payer: every bill type now belongs to the payer", [...owners.values()].every((o) => o === f.admin.membershipId) && moved.typesReassigned === 1, { owners: [...owners], moved });
  r.check("…the household is single payer", (await admin()).household.mode === "single_payer");
  r.check("…the bill posted before keeps its owner", (await billOwner(water.billId)) === f.member.membershipId);
  r.check("…and so does the original bill", (await billOwner(f.billId)) === f.admin.membershipId);
  const pairs = await withHousehold(await admin(), (tx) => getOwedPairs(tx));
  r.check("…so what the admin owes on it is still owed to the member", pairs.some((p) => p.debtorId === f.admin.membershipId && p.ownerId === f.member.membershipId && p.amount === 30), pairs);
  const later = await withHousehold(await admin(), async (tx) => createBill(tx, await admin(), { typeId: f.memberTypeId, amount: 40, billDate: "2030-02-01", dueDate: "2030-02-20" }));
  r.check("a Water bill posted after the switch is owed to the payer", (await billOwner(later.billId)) === f.admin.membershipId);
  r.check("…while the old one still names the member", (await withHousehold(await admin(), (tx) => getBill(tx, water.billId)))?.ownerId === f.member.membershipId);

  const third = await addMember(owner, f, `f5-third`);
  const handed = await save(await admin(), { mode: "single_payer", payerId: String(third.membershipId) });
  owners = await typeOwners();
  r.check("staying single payer with a new payer hands every type over", [...owners.values()].every((o) => o === third.membershipId) && handed.typesReassigned === 2);
  r.check("…without touching any bill", (await billOwner(water.billId)) === f.member.membershipId && (await billOwner(later.billId)) === f.admin.membershipId);

  await save(await admin(), { mode: "ledger" });
  owners = await typeOwners();
  r.check("single payer → ledger: just the mode; types keep their owners", (await admin()).household.mode === "ledger" && [...owners.values()].every((o) => o === third.membershipId));
  r.check("…and bills keep theirs", (await billOwner(water.billId)) === f.member.membershipId && (await billOwner(later.billId)) === f.admin.membershipId);
  const elsewhere = await owner<{ o: number | null }[]>`SELECT owner_id AS o FROM bill_types WHERE household_id = ${other.id}`;
  r.check("another household's types are untouched throughout", elsewhere.every((t) => t.o === other.admin.membershipId || t.o === other.member.membershipId));

  // -------------------------------------------------------------------------------------------
  r.section("features: settings validation and persistence");
  const parse = async (over: Partial<SettingsForm>) => {
    try {
      return parseSettings(await form(await admin(), over));
    } catch (e) {
      return e instanceof ActionError ? e.message : `bug: ${e}`;
    }
  };
  const peach = await parse({ theme: "peach", colorScheme: "system" });
  r.check("peach always saves light, whatever the scheme field says", typeof peach === "object" && peach.colorScheme === "light", peach);
  r.check("an unknown theme → refused", /theme/.test(String(await parse({ theme: "neon" }))));
  r.check("bills per page off the list → refused", /per page/.test(String(await parse({ billsPerPage: "7" }))));
  r.check("an empty household name → refused", /Name the household/.test(String(await parse({ name: "  " }))));
  r.check("a lease that ends before it starts → refused", /end after it starts/.test(String(await parse({ leaseStart: "2030-06-01", leaseEnd: "2030-01-01" }))));
  r.check("a non-date lease start → refused", /isn't a date/.test(String(await parse({ leaseStart: "2030-02-30" }))));
  r.check("a rent that isn't an amount → refused", /Monthly rent/.test(String(await parse({ monthlyRent: "lots" }))));
  const rent = await parse({ monthlyRent: "$1,450", leaseStart: "2030-01-15", leaseEnd: "2030-12-31" });
  r.check("rent like $1,450 parses to 1450", typeof rent === "object" && rent.monthlyRent === 1450, rent);

  await save(await admin(), {
    name: "Verify F5 Renamed", tagline: "Bills, split", theme: "peach", colorScheme: "system", askBillDate: true, billsPerPage: "20",
    features: { rent: true, trends: true, bulkEmail: false, documents: false, welcomeTour: true, thanks: false },
    monthlyRent: "1450.00", leaseStart: "2030-01-15", leaseEnd: "2030-12-31",
  });
  const h = (await admin()).household;
  r.check("the theme switch persists (peach, light)", h.theme === "peach" && h.colorScheme === "light", { theme: h.theme, scheme: h.colorScheme });
  r.check("name, tagline, ask-for-date and page size persist", h.name === "Verify F5 Renamed" && h.tagline === "Bills, split" && h.askBillDate && h.billsPerPage === 20);
  r.check("every feature toggle persists", h.featureRent && h.featureTrends && !h.featureBulkEmail && !h.featureDocuments && h.featureWelcomeTour && !h.featureThanks);
  r.check("rent and lease persist", h.monthlyRent === 1450 && h.leaseStart === "2030-01-15" && h.leaseEnd === "2030-12-31");
  await save(await admin(), { features: { ...settingsFormFrom(h, null).features, rent: false } });
  const h2 = (await admin()).household;
  r.check("turning rent off keeps the figures for next time", !h2.featureRent && h2.monthlyRent === 1450 && h2.leaseStart === "2030-01-15");
  await save(await admin(), { theme: "statement", colorScheme: "light" });
  r.check("back to statement, always light", (await admin()).household.theme === "statement" && (await admin()).household.colorScheme === "light");

  // -------------------------------------------------------------------------------------------
  r.section("features: gating");
  let links = navLinks(await member()).map((l) => l.href);
  r.check("nav: trends on, documents off → Trends shown, Docs hidden", links.includes("/trends") && !links.includes("/documents"), links);
  await owner`UPDATE households SET feature_trends = false, feature_documents = true WHERE id = ${f.id}`;
  links = navLinks(await member()).map((l) => l.href);
  r.check("nav: trends off, documents on → the reverse", !links.includes("/trends") && links.includes("/documents"), links);
  r.check("the demo nav has no Account", !navLinks(demoCtx()).some((l) => l.href === "/account"));

  // Thanks off (saved above): checking someone off queues nothing.
  await owner`DELETE FROM payment_thanks WHERE household_id = ${f.id}`;
  await withHousehold(await admin(), async (tx) => setPaid(tx, await admin(), f.billId, f.member.membershipId, true));
  let [{ n }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM payment_thanks WHERE household_id = ${f.id}`;
  r.check("thanks off: marking a payment queues no receipt", n === 0);
  await owner`UPDATE households SET feature_thanks = true WHERE id = ${f.id}`;
  await withHousehold(await admin(), async (tx) => setPaid(tx, await admin(), f.billId, f.member.membershipId, false));
  await withHousehold(await admin(), async (tx) => setPaid(tx, await admin(), f.billId, f.member.membershipId, true));
  [{ n }] = await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM payment_thanks WHERE household_id = ${f.id}`;
  r.check("…on: it does (control)", n === 1);

  // -------------------------------------------------------------------------------------------
  r.section("features: trends");
  const types = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, name: `T${id}`, emoji: "•" }));
  const t = buildTrends(
    [
      { month: "2029-10", typeId: 1, total: 50 },
      { month: "2030-03", typeId: 1, total: 70.5 },
      { month: "2030-03", typeId: 6, total: 10 },
      { month: "2030-03", typeId: 7, total: 5.25 },
      { month: "2030-04", typeId: 2, total: 30 },
    ],
    types,
    "2030-04-18",
  );
  r.check("twelve months ending this month, in the household's calendar", t.months.length === 7 && t.months[0] === "2029-10" && t.months.at(-1) === "2030-04", t.months);
  r.check("types take slots 1–5 by creation order; the rest fold into Other", t.series.map((s) => s.slot).join() === "1,2,3,4,5," && t.series.at(-1)?.key === "other");
  r.check("a month with no bill is a gap (null), never $0", t.series[0].values[1] === null && t.series[0].values[5] === 70.5);
  r.check("Other sums the folded types", t.series.at(-1)?.values[5] === 15.25);
  r.check("year to date and all time per type", t.totals[0].yearToDate === 70.5 && t.totals[0].allTime === 120.5);
  const long = buildTrends([{ month: "2027-01", typeId: 1, total: 1 }], types, "2030-04-18");
  r.check("a long history still charts only the last 12 months", long.months.length === 12 && long.months[0] === "2029-05");
  const csv = trendsCsv([{ month: "2030-03", typeId: 1, total: 70.5 }, { month: "2030-03", typeId: 2, total: 9 }], [{ id: 1, name: "=HYPERLINK(1)", emoji: "" }, { id: 2, name: 'Gas, "fixed"', emoji: "" }]);
  r.check("CSV: a formula-looking name is defused and commas/quotes are quoted", csv.startsWith(`Month,'=HYPERLINK(1),"Gas, ""fixed""",Total\r\n2030-03,70.50,9.00,79.50`), csv);

  // -------------------------------------------------------------------------------------------
  r.section("features: the calendar feed (contents)");
  const token = (await owner<{ k: string }[]>`SELECT calendar_token AS k FROM memberships WHERE id = ${f.member.membershipId}`)[0].k;
  r.check("tokens are 43 base64url characters", isCalendarToken(token) && !isCalendarToken(`${token}=`) && !isCalendarToken("short"));
  const links2 = calendarLinks(token);
  r.check("subscribe links: webcal for Apple, Google's add-by-URL", links2.webcal.startsWith("webcal://") && links2.google.startsWith("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F"));
  const scope = (hid: number) => ({ household: { id: hid }, user: null });
  await owner`UPDATE households SET feature_rent = false WHERE id = ${f.id}`;
  let ics = (await withHousehold(scope(f.id), (tx) => buildCalendar(tx, f.member.membershipId)))!;
  const lines = ics.split("\r\n");
  r.check("CRLF line ends, every line folded to 75 octets", !/[^\r]\n/.test(ics) && lines.every((l) => new TextEncoder().encode(l).length <= 75));
  r.check("one event per bill in the household", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 3 && ics.includes(`UID:bill-${water.billId}@`));
  r.check("worded for the viewer: the member is owed on Water", /SUMMARY:💧 Water due · 1 person still owes you \$30\.00/.test(ics.replace(/\r\n /g, "")), ics);
  r.check("rent off → no rent event", !ics.includes("RRULE"));
  await owner`UPDATE households SET feature_rent = true WHERE id = ${f.id}`;
  ics = (await withHousehold(scope(f.id), (tx) => buildCalendar(tx, f.member.membershipId)))!.replace(/\r\n /g, "");
  r.check("rent on → monthly on the 1st from the first 1st of the lease, until it ends", ics.includes("DTSTART;VALUE=DATE:20300201") && ics.includes("RRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20301231") && ics.includes("Rent due · $1\\,450.00"), ics);
  const otherIcs = (await withHousehold(scope(other.id), (tx) => buildCalendar(tx, other.member.membershipId)))!;
  r.check("another household's feed has none of these bills", !otherIcs.includes(`bill-${water.billId}@`) && !otherIcs.includes(`bill-${f.billId}@`) && otherIcs.includes(`bill-${other.billId}@`));
}
