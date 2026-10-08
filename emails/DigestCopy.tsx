import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Rows, Shell, longDate, money } from "./Shell";

// The digest copy of household mail about one bill: a new-bill notice, a corrected bill, a
// removed bill, or a per-bill reminder from the portal. Says what went out and to whom; goes
// to digest_email when set.

export interface DigestCopyProps {
  theme: Theme;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  event: "new_bill" | "bill_updated" | "bill_removed" | "reminder";
  actorName: string | null; // who posted, corrected or removed the bill, or pressed the reminder button; null: not recorded
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  sentTo: string[];
  failed: number;
}

const DIGEST_EVENTS: Record<DigestCopyProps["event"], { what: string; eyebrow: string; subject: string }> = {
  new_bill: { what: "posted", eyebrow: "New bill posted", subject: "Posted" },
  bill_updated: { what: "corrected", eyebrow: "Bill corrected", subject: "Corrected" },
  bill_removed: { what: "removed", eyebrow: "Bill removed", subject: "Removed" },
  reminder: { what: "sent reminders for", eyebrow: "Reminders sent", subject: "Reminded" },
};

/** The digest email's subject line for one event. */
export const digestSubject = (event: DigestCopyProps["event"], typeName: string, emailed: number) =>
  `${DIGEST_EVENTS[event].subject}: ${typeName}, emailed ${emailed}`;

export default function DigestCopy(p: DigestCopyProps) {
  const { what, eyebrow } = DIGEST_EVENTS[p.event];
  return (
    <Shell theme={p.theme} masthead={`${p.householdName} · ${BRAND.name}`} footer={BRAND.domain} preview={`${p.actorName ?? "Someone"} ${what} the ${p.typeName} bill.`}>
      <Eyebrow theme={p.theme}>{eyebrow}</Eyebrow>
      <Heading theme={p.theme}>
        {p.actorName ? `${p.actorName} ${what} the ${p.typeName} bill` : `The ${p.typeName} bill was ${what}`}
      </Heading>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Statement total", value: `$${money(p.total)}` },
          { label: "Each share", value: `$${money(p.perPersonCost)}` },
          { label: "Due", value: longDate(p.dueDate) },
          { label: "Emailed", value: p.sentTo.join(", ") || "nobody" },
          ...(p.failed ? [{ label: "Didn't send", value: String(p.failed), urgent: true }] : []),
        ]}
      />
      <ButtonLink theme={p.theme} href={appUrl(householdPath({ slug: p.householdSlug }, "/portal"))}>
        Open the portal
      </ButtonLink>
    </Shell>
  );
}

DigestCopy.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  householdSlug: "elm-street",
  event: "new_bill",
  actorName: "Alex",
  typeName: "Electric",
  total: 50.33,
  perPersonCost: 25.17,
  dueDate: "2026-10-09",
  sentTo: ["Sam", "Riley"],
  failed: 0,
} satisfies DigestCopyProps;
