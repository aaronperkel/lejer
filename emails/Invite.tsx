import type { Theme } from "../lib/types";
import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import { ButtonLink, Eyebrow, Heading, Paragraph, Shell } from "./Shell";

// "{Admin} added you to {Household} on {BRAND.name}". Sent from login@ like the code (an account
// email), but in the household's theme since the household is known. The email-code login
// proves the address, so the link is just /login prefilled, returning to the household's own
// URL; signing in stamps joined_at.

export default function Invite({
  theme,
  householdName,
  householdSlug,
  inviterName,
  inviteeName,
  email,
}: {
  theme: Theme;
  householdName: string;
  householdSlug: string;
  inviterName: string;
  inviteeName: string;
  email: string;
}) {
  return (
    <Shell
      theme={theme}
      masthead={`${BRAND.name} · ${householdName}`}
      footer={BRAND.domain}
      preview={`${inviterName} added you to ${householdName} on ${BRAND.name}.`}
    >
      <Eyebrow theme={theme}>You&apos;re invited</Eyebrow>
      <Heading theme={theme}>Join {householdName} on {BRAND.name}</Heading>
      <Paragraph theme={theme}>
        Hi {inviteeName}, {inviterName} added you to <strong>{householdName}</strong>, where the household
        splits its bills and keeps track of who owes whom.
      </Paragraph>
      <Paragraph theme={theme}>
        Sign in with this email address ({email}). We&apos;ll email you a one-time code, no password needed.
      </Paragraph>
      <ButtonLink theme={theme} href={appUrl(`/login?${new URLSearchParams({ email, next: householdPath({ slug: householdSlug }) })}`)}>
        Sign in to {BRAND.name}
      </ButtonLink>
    </Shell>
  );
}

Invite.PreviewProps = {
  theme: "peach",
  householdName: "7 Oak Lane",
  householdSlug: "oak-lane",
  inviterName: "Sam",
  inviteeName: "Alex",
  email: "alex@example.com",
};
