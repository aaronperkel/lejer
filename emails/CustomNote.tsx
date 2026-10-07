import { BRAND, appUrl } from "../lib/brand";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Prose, Shell } from "./Shell";

// A freeform note from an admin to the whole household (/portal/email). The subject doubles as
// the heading; the body is the admin's own words, split into paragraphs.

export interface CustomNoteProps {
  theme: Theme;
  householdName: string;
  senderName: string;
  subject: string;
  body: string;
}

export default function CustomNote(p: CustomNoteProps) {
  return (
    <Shell theme={p.theme} masthead={`${p.householdName} · ${BRAND.name}`} footer={BRAND.domain} preview={p.body.slice(0, 140)}>
      <Eyebrow theme={p.theme}>A note from {p.senderName}</Eyebrow>
      <Heading theme={p.theme}>{p.subject}</Heading>
      <Prose theme={p.theme} text={p.body} />
      <ButtonLink theme={p.theme} href={appUrl("/")}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

CustomNote.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  senderName: "Alex",
  subject: "Internet is switching providers",
  body: "Heads up: the new internet plan starts on the 20th.\n\nThe bill will be a little lower, and the router stays where it is.",
} satisfies CustomNoteProps;
