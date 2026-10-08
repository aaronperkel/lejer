import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate, money } from "./Shell";

// Sent right after a bill that had already been emailed is deleted (nobody had paid on it), to
// everyone it was emailed about: the debtors are told they don't owe it, the owner that it's
// off the record. Nothing is queued: the delete was confirmed in a dialog, and the bill is gone.

export interface BillRemovedProps {
  theme: Theme;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  recipientName: string;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  removedByName: string;
  isOwner: boolean;
}

export default function BillRemoved(p: BillRemovedProps) {
  const due = longDate(p.dueDate);
  const outcome = p.isOwner
    ? "Nobody owes you anything on it now."
    : `You don't owe the $${money(p.perPersonCost)} from the earlier email.`;
  return (
    <Shell theme={p.theme} masthead={`${p.householdName} · ${BRAND.name}`} footer={BRAND.domain} preview={`${p.typeName} bill removed. ${outcome}`}>
      <Eyebrow theme={p.theme}>Bill removed</Eyebrow>
      <Heading theme={p.theme}>
        {p.typeName} · was due {due}
      </Heading>
      <Paragraph theme={p.theme}>
        Hi {p.recipientName}, {p.removedByName} removed the {p.typeName} bill, probably to fix a mistake. {outcome} If it was
        posted again, you&apos;ll get a separate email about the new one.
      </Paragraph>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Bill", value: p.typeName },
          { label: "Statement total", value: `$${money(p.total)}` },
          { label: p.isOwner ? "Each owed you" : "Your share was", value: `$${money(p.perPersonCost)}` },
        ]}
      />
      <ButtonLink theme={p.theme} href={appUrl(householdPath({ slug: p.householdSlug }))}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

BillRemoved.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  householdSlug: "elm-street",
  recipientName: "Sam",
  typeName: "Gas",
  total: 61.75,
  perPersonCost: 30.88,
  dueDate: "2026-10-19",
  removedByName: "Alex",
  isOwner: false,
} satisfies BillRemovedProps;
