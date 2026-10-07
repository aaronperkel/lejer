import { FORMER_MEMBER } from "@/lib/bills";
import { BRAND, appUrl } from "@/lib/brand";
import type { Tx } from "@/lib/db";
import { hasFeature } from "@/lib/features";
import { getCurrentHousehold } from "@/lib/households";

// The personal calendar feed (/cal.ics?k=<token>): every bill's due date as an all-day event,
// worded for the person whose token it is ("you owe Jordan $26.03", "2 still owe you"), plus
// a monthly rent event while feature_rent is on and a lease start is set. Ported from
// utilities' lib/ics.ts. Runs inside withHousehold for the token's household, so RLS keeps it
// to that household's rows. RFC 5545: CRLF line ends, TEXT escaped, lines folded at 75 octets.

const CRLF = "\r\n";

/** Calendar subscription links for a token: webcal for Apple (and most apps), and Google's add-by-URL. */
export function calendarLinks(token: string): { https: string; webcal: string; google: string } {
  const https = appUrl(`/cal.ics?k=${encodeURIComponent(token)}`);
  const webcal = https.replace(/^https?:/, "webcal:");
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

/** A token looks like one (32 random bytes, base64url) before any database work. */
export const isCalendarToken = (k: string | null): k is string => !!k && /^[A-Za-z0-9_-]{43}$/.test(k);

function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to 75 octets per physical line without splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}

const ymd = (d: string) => d.replaceAll("-", "");
function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface FeedBill {
  id: number;
  dueDate: string;
  billDate: string;
  total: number;
  perPersonCost: number;
  typeName: string;
  typeEmoji: string;
  ownerId: number | null;
  ownerName: string | null;
  hadOwner: boolean;
  /** The viewer's own debt row: null when they have none on this bill. */
  iOwe: boolean | null;
  stillOwing: number;
  stillOwed: number;
}

/** The feed for one membership. Null if the household row isn't visible (it always is in scope). */
export async function buildCalendar(tx: Tx, membershipId: number): Promise<string | null> {
  const h = await getCurrentHousehold(tx);
  if (!h) return null;
  const bills = await tx<FeedBill[]>`
    SELECT b.id, b.due_date AS "dueDate", b.bill_date AS "billDate", b.total, b.per_person_cost AS "perPersonCost",
      t.name AS "typeName", t.emoji AS "typeEmoji", b.owner_id AS "ownerId", b.had_owner AS "hadOwner",
      ou.name AS "ownerName",
      CASE WHEN mine.bill_id IS NULL THEN NULL ELSE mine.paid_at IS NULL END AS "iOwe",
      (SELECT count(*) FROM bill_debts d WHERE d.bill_id = b.id AND d.paid_at IS NULL) AS "stillOwing",
      b.per_person_cost * (SELECT count(*) FROM bill_debts d WHERE d.bill_id = b.id AND d.paid_at IS NULL) AS "stillOwed"
    FROM bills b
    JOIN bill_types t ON t.id = b.type_id
    LEFT JOIN memberships om ON om.id = b.owner_id
    LEFT JOIN users ou ON ou.id = om.user_id
    LEFT JOIN bill_debts mine ON mine.bill_id = b.id AND mine.person_id = ${membershipId}
    ORDER BY b.due_date, b.id`;

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const host = BRAND.domain;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${text(BRAND.name)}//Bills calendar//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(`${h.name} bills`)}`,
    `X-WR-CALDESC:${text(`Bill due dates for ${h.name}, from ${BRAND.name}.`)}`,
    `X-WR-TIMEZONE:${h.timezone}`,
    // Polling hints: every request wakes the database, so ask apps not to check more than this.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  const link = appUrl("/");
  for (const b of bills) {
    const owner = b.ownerId === null ? (b.hadOwner ? FORMER_MEMBER : "the house") : (b.ownerName ?? FORMER_MEMBER);
    let status: string;
    if (b.ownerId === membershipId) {
      status = b.stillOwing ? `${plural(b.stillOwing, "person still owes", "people still owe")} you ${money(b.stillOwed)}` : "everyone's paid you";
    } else if (b.iOwe === true) {
      status = `you owe ${owner} ${money(b.perPersonCost)}`;
    } else if (b.iOwe === false) {
      status = "you paid";
    } else {
      status = b.stillOwing ? "open" : "settled";
    }
    const summary = `${b.typeEmoji} ${b.typeName} due · ${status}`;
    const description = [
      `${b.typeName} bill dated ${b.billDate}: ${money(b.total)} total, ${money(b.perPersonCost)} each.`,
      `Fronted by ${owner}.`,
      `Open the household: ${link}`,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:bill-${b.id}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(b.dueDate)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(b.dueDate))}`,
      `SUMMARY:${text(summary)}`,
      `DESCRIPTION:${text(description)}`,
      `URL:${link}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  // Rent: the 1st of every month from the lease start (through its end, if set).
  if (hasFeature(h, "rent") && h.leaseStart) {
    const [y, m, d] = h.leaseStart.split("-").map(Number);
    const first = d === 1 ? h.leaseStart : new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    if (!h.leaseEnd || first <= h.leaseEnd) {
      const rule = `RRULE:FREQ=MONTHLY;BYMONTHDAY=1${h.leaseEnd ? `;UNTIL=${ymd(h.leaseEnd)}` : ""}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:rent-${h.id}@${host}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(first)}`,
        `DTEND;VALUE=DATE:${ymd(nextDay(first))}`,
        rule,
        `SUMMARY:${text(`🏠 Rent due${h.monthlyRent !== null ? ` · ${money(h.monthlyRent)}` : ""}`)}`,
        `URL:${link}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}
