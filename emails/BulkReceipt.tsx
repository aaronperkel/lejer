import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Prose, Rows, Shell } from "./Shell";

// The digest copy of a bulk email (/{slug}/household/email): what went out, to whom, and the message.

export interface BulkReceiptProps {
  theme: Theme;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  senderName: string;
  subject: string;
  body: string;
  sentTo: string[];
  failedTo: string[];
}

export default function BulkReceipt(p: BulkReceiptProps) {
  return (
    <Shell theme={p.theme} masthead={`${p.householdName} · ${BRAND.name}`} footer={BRAND.domain} preview={`${p.senderName} emailed the household: ${p.subject}`}>
      <Eyebrow theme={p.theme}>Bulk email receipt</Eyebrow>
      <Heading theme={p.theme}>{p.senderName} emailed the household</Heading>
      <Rows
        theme={p.theme}
        rows={[
          { label: "Subject", value: p.subject },
          { label: "Sent to", value: p.sentTo.join(", ") || "nobody" },
          ...(p.failedTo.length ? [{ label: "Didn't send", value: p.failedTo.join(", "), urgent: true }] : []),
        ]}
      />
      <Eyebrow theme={p.theme}>The message</Eyebrow>
      <Prose theme={p.theme} text={p.body} />
      <ButtonLink theme={p.theme} href={appUrl(householdPath({ slug: p.householdSlug }))}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

BulkReceipt.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  householdSlug: "elm-street",
  senderName: "Alex",
  subject: "Internet is switching providers",
  body: "Heads up: the new internet plan starts on the 20th.",
  sentTo: ["Sam", "Riley"],
  failedTo: [],
} satisfies BulkReceiptProps;
