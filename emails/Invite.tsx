import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Shell, appUrl } from "./Shell";

// "{Admin} added you to {Household} on Lejer". Sent from login@ like the code (an account
// email), but in the household's theme since the household is known. The email-code login
// proves the address, so the link is just /login prefilled; signing in stamps joined_at.

export default function Invite({
  theme,
  householdName,
  inviterName,
  inviteeName,
  email,
}: {
  theme: Theme;
  householdName: string;
  inviterName: string;
  inviteeName: string;
  email: string;
}) {
  return (
    <Shell
      theme={theme}
      masthead={`Lejer · ${householdName}`}
      footer="lejer.app"
      preview={`${inviterName} added you to ${householdName} on Lejer.`}
    >
      <Eyebrow theme={theme}>You&apos;re invited</Eyebrow>
      <Heading theme={theme}>Join {householdName} on Lejer</Heading>
      <Paragraph theme={theme}>
        Hi {inviteeName}, {inviterName} added you to <strong>{householdName}</strong>, where the household
        splits its bills and keeps track of who owes whom.
      </Paragraph>
      <Paragraph theme={theme}>
        Sign in with this email address ({email}). We&apos;ll email you a one-time code, no password needed.
      </Paragraph>
      <ButtonLink theme={theme} href={appUrl(`/login?${new URLSearchParams({ email })}`)}>
        Sign in to Lejer
      </ButtonLink>
    </Shell>
  );
}

Invite.PreviewProps = {
  theme: "peach",
  householdName: "7 Oak Lane",
  inviterName: "Sam",
  inviteeName: "Alex",
  email: "alex@example.com",
};
