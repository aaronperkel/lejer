import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate, money, nameList } from "./Shell";

// Sent when a bill is posted, 10 minutes later (lib/notices.ts), to the joined debtors and the
// owner. Owner-aware: debtors are told what they owe and who to pay; the owner is told who owes
// them. The "updated" variant goes out when a bill that was already emailed is edited, to
// everyone on it before or after the edit: someone the edit dropped (a former owner) is told it
// is no longer theirs (`released`). Reply-To is the bill's owner (set by the caller), so "reply to settle up"
// reaches the person being paid.

export interface NewBillProps {
  theme: Theme;
  householdName: string;
  recipientName: string;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  ownerName: string | null;
  postedByName: string;
  isOwner: boolean;
  debtorNames: string[];
  hasPdf: boolean;
  variant?: "new" | "updated";
  /** Updated only: this person was on the bill before the edit and isn't any more. */
  released?: boolean;
}

export default function NewBill(p: NewBillProps) {
  const due = longDate(p.dueDate);
  const updated = p.variant === "updated";
  const owesYou =
    p.debtorNames.length === 0
      ? "Nobody else owes on it."
      : `${nameList(p.debtorNames)} ${p.debtorNames.length === 1 ? "owes" : "each owe"} you $${money(p.perPersonCost)}.`;
  const intro = p.released
    ? `You're no longer on it: you don't owe anything, and nothing on it is owed to you${p.ownerName ? `. It's owed to ${p.ownerName} now` : ""}.`
    : p.isOwner
      ? owesYou
      : `Your share is $${money(p.perPersonCost)}${p.ownerName ? `; send it to ${p.ownerName}, who paid the provider.` : "."}`;
  const lead = updated ? `The ${p.typeName} bill was corrected.` : `${p.postedByName} posted a new ${p.typeName} bill.`;
  const preview = p.released
    ? `${p.typeName}: you're no longer on this bill.`
    : p.isOwner
      ? `${p.typeName}: ${intro}`
      : `${p.typeName}: your share ${updated ? "is now " : ""}$${money(p.perPersonCost)}, due ${due}.`;
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      preview={preview}
    >
      <Eyebrow theme={p.theme}>{updated ? "Bill corrected" : "New bill posted"}</Eyebrow>
      <Heading theme={p.theme}>
        {p.typeName} · due {due}
      </Heading>
      <Paragraph theme={p.theme}>
        Hi {p.recipientName}, {lead} {intro}
        {updated && !p.released ? " These figures replace the ones in the earlier email." : ""}
      </Paragraph>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Bill", value: p.typeName },
          { label: "Statement total", value: `$${money(p.total)}` },
          ...(p.released ? [] : [{ label: p.isOwner ? "Each owes you" : "Your share", value: `$${money(p.perPersonCost)}`, strong: true }]),
          ...(p.ownerName && !p.isOwner && !p.released ? [{ label: "Pay to", value: p.ownerName }] : []),
          { label: "Due", value: due },
        ]}
      />
      <ButtonLink theme={p.theme} href={appUrl("/")}>
        {p.hasPdf ? "See the bill and the statement" : `Open ${p.householdName}`}
      </ButtonLink>
    </Shell>
  );
}

NewBill.PreviewProps = {
  theme: "peach",
  householdName: "7 Oak Lane",
  recipientName: "Alex",
  typeName: "Water",
  total: 42.18,
  perPersonCost: 21.09,
  dueDate: "2026-10-20",
  ownerName: "Sam",
  postedByName: "Sam",
  isOwner: false,
  debtorNames: ["Alex"],
  hasPdf: true,
} satisfies NewBillProps;
