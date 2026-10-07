import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Rows, Shell, longDate, money } from "./Shell";

// The digest copy of household mail about one bill: a new-bill notice or a per-bill reminder
// from the portal. Says what went out and to whom; goes to digest_email when set.

export interface DigestCopyProps {
  theme: Theme;
  householdName: string;
  event: "new_bill" | "reminder";
  actorName: string; // who posted the bill or pressed the reminder button
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  sentTo: string[];
  failed: number;
}

export default function DigestCopy(p: DigestCopyProps) {
  const what = p.event === "new_bill" ? "posted" : "sent reminders for";
  return (
    <Shell theme={p.theme} masthead={`${p.householdName} · ${BRAND.name}`} footer={BRAND.domain} preview={`${p.actorName} ${what} the ${p.typeName} bill.`}>
      <Eyebrow theme={p.theme}>{p.event === "new_bill" ? "New bill posted" : "Reminders sent"}</Eyebrow>
      <Heading theme={p.theme}>
        {p.actorName} {what} the {p.typeName} bill
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
      <ButtonLink theme={p.theme} href={appUrl("/portal")}>
        Open the portal
      </ButtonLink>
    </Shell>
  );
}

DigestCopy.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  event: "new_bill",
  actorName: "Alex",
  typeName: "Electric",
  total: 50.33,
  perPersonCost: 25.17,
  dueDate: "2026-10-09",
  sentTo: ["Sam", "Riley"],
  failed: 0,
} satisfies DigestCopyProps;
