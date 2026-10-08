import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate, money } from "./Shell";

// A payment reminder for one debtor on one bill: the per-bill button on the bills page (phase 3) and
// the daily cron batch (phase 4). Urgent when the bill is within the household's urgent window
// or overdue. Reply-To is the bill's owner (set by the caller).

export interface ReminderProps {
  theme: Theme;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  recipientName: string;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  ownerName: string | null;
  urgent: boolean;
  /** Past its due date (urgent too). */
  overdue?: boolean;
}

export default function Reminder(p: ReminderProps) {
  const due = longDate(p.dueDate);
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      preview={`${p.typeName}: your share $${money(p.perPersonCost)}${p.ownerName ? ` to ${p.ownerName}` : ""}, due ${due}.`}
    >
      <Eyebrow theme={p.theme} urgent={p.urgent}>
        {p.overdue ? "Past due" : p.urgent ? "Due soon" : "Payment reminder"}
      </Eyebrow>
      <Heading theme={p.theme}>
        {p.typeName} bill {p.overdue ? "was due" : "due"} {due}
      </Heading>
      <Paragraph theme={p.theme}>
        Hi {p.recipientName}, your share of the {p.typeName} bill is still open
        {p.ownerName ? `. ${p.ownerName} paid the provider, so send it their way.` : "."}
      </Paragraph>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Bill", value: p.typeName },
          { label: "Statement total", value: `$${money(p.total)}` },
          { label: "Your share", value: `$${money(p.perPersonCost)}`, strong: true },
          ...(p.ownerName ? [{ label: "Pay to", value: p.ownerName }] : []),
          { label: "Due", value: due, urgent: p.urgent },
        ]}
      />
      <ButtonLink theme={p.theme} href={appUrl(householdPath({ slug: p.householdSlug }))}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

Reminder.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  householdSlug: "elm-street",
  recipientName: "Sam",
  typeName: "Electric",
  total: 50.33,
  perPersonCost: 25.17,
  dueDate: "2026-10-09",
  ownerName: "Alex",
  urgent: true,
} satisfies ReminderProps;
