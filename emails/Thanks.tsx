import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate, money } from "./Shell";

// The debounced receipt (lib/thanks.ts): one email per person once their newest checked-off
// payment has sat for the undo window, covering every bill marked paid in that burst.

export interface ThanksProps {
  theme: Theme;
  householdName: string;
  recipientName: string;
  bills: { typeName: string; dueDate: string; perPersonCost: number; ownerName: string | null }[];
}

export default function Thanks(p: ThanksProps) {
  const total = Math.round(p.bills.reduce((s, b) => s + b.perPersonCost * 100, 0)) / 100;
  const many = p.bills.length > 1;
  const rows = p.bills.map((b) => ({
    label: `${b.typeName} · due ${longDate(b.dueDate)}`,
    value: `$${money(b.perPersonCost)}`,
    ...(many ? {} : { strong: true, paid: true }),
  }));
  if (many) rows.push({ label: "Total recorded", value: `$${money(total)}`, strong: true, paid: true });
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      preview={`$${money(total)} recorded as paid. You're settled up on ${many ? "these bills" : "this bill"}.`}
    >
      <Eyebrow theme={p.theme} paid>
        Payment recorded
      </Eyebrow>
      <Heading theme={p.theme}>Thanks, {p.recipientName}</Heading>
      <Paragraph theme={p.theme}>
        Your payment{many ? "s are" : " is"} on the record. You&apos;re settled up on the bill{many ? "s" : ""} below.
      </Paragraph>
      <Rows theme={p.theme} rows={rows} />
      <ButtonLink theme={p.theme} href={appUrl("/")}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

Thanks.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  recipientName: "Sam",
  bills: [
    { typeName: "Electric", dueDate: "2026-10-09", perPersonCost: 25.17, ownerName: "Alex" },
    { typeName: "Internet", dueDate: "2026-10-15", perPersonCost: 20, ownerName: "Alex" },
  ],
} satisfies ThanksProps;
