import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, longDate } from "./Shell";

// The digest copy of the daily reminder batch (lib/reminders.ts), sent to digest_email when set.

export interface BatchConfirmationProps {
  theme: Theme;
  householdName: string;
  date: string; // the household's local date the batch ran
  sent: { name: string; typeName: string; urgent: boolean }[];
  failed: number;
}

export default function BatchConfirmation(p: BatchConfirmationProps) {
  const n = p.sent.length;
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      preview={`${n} reminder${n === 1 ? "" : "s"} went out ${longDate(p.date)}.`}
    >
      <Eyebrow theme={p.theme}>Reminder batch · {longDate(p.date)}</Eyebrow>
      <Heading theme={p.theme}>
        {n} reminder{n === 1 ? "" : "s"} sent
      </Heading>
      {p.failed > 0 && (
        <Paragraph theme={p.theme}>
          {p.failed} more didn&apos;t send. The household will see them again on the next reminder day.
        </Paragraph>
      )}
      <Rows theme={p.theme} rows={p.sent.map((s) => ({ label: s.name, value: `${s.typeName}${s.urgent ? " · due soon" : ""}`, urgent: s.urgent }))} />
      <ButtonLink theme={p.theme} href={appUrl("/portal")}>
        Open the portal
      </ButtonLink>
    </Shell>
  );
}

BatchConfirmation.PreviewProps = {
  theme: "peach",
  householdName: "7 Oak Lane",
  date: "2026-10-07",
  sent: [
    { name: "Sam", typeName: "Electric", urgent: true },
    { name: "Riley", typeName: "Internet", urgent: false },
  ],
  failed: 0,
} satisfies BatchConfirmationProps;
