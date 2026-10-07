import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate, money, nameList } from "./Shell";

// Sent to every joined splitter when a bill is posted. Owner-aware: debtors are told what they
// owe and who to pay; the owner is told who owes them. Reply-To is the owner (set by the caller),
// so "reply to settle up" reaches the person being paid.

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
}

export default function NewBill(p: NewBillProps) {
  const due = longDate(p.dueDate);
  const intro = p.isOwner
    ? `${nameList(p.debtorNames)} ${p.debtorNames.length === 1 ? "owes" : "each owe"} you $${money(p.perPersonCost)}.`
    : `Your share is $${money(p.perPersonCost)}${p.ownerName ? `; send it to ${p.ownerName}, who paid the provider.` : "."}`;
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      preview={p.isOwner ? `${p.typeName}: ${intro}` : `${p.typeName}: your share $${money(p.perPersonCost)}, due ${due}.`}
    >
      <Eyebrow theme={p.theme}>New bill posted</Eyebrow>
      <Heading theme={p.theme}>
        {p.typeName} · due {due}
      </Heading>
      <Paragraph theme={p.theme}>
        Hi {p.recipientName}, {p.postedByName} posted a new {p.typeName} bill. {intro}
      </Paragraph>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Bill", value: p.typeName },
          { label: "Statement total", value: `$${money(p.total)}` },
          { label: p.isOwner ? "Each owes you" : "Your share", value: `$${money(p.perPersonCost)}`, strong: true },
          ...(p.ownerName && !p.isOwner ? [{ label: "Pay to", value: p.ownerName }] : []),
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
