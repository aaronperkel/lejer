import { Text } from "@react-email/components";
import { Eyebrow, Heading, Paragraph, Shell, palette } from "./Shell";
import { BRAND } from "../lib/brand";

// One-time sign-in code. Sent before any household is known, so it always wears the
// statement shell and the product masthead. The code leads the subject (set by the caller) so
// it shows in notification previews and Apple Mail's code autofill.

export default function LoginCode({ code, name }: { code: string; name?: string | null }) {
  const theme = "statement" as const;
  const p = palette(theme);
  return (
    <Shell theme={theme} masthead={BRAND.name} footer={BRAND.domain} preview={`${code} is your ${BRAND.name} sign-in code.`}>
      <Eyebrow theme={theme}>Sign-in code</Eyebrow>
      <Heading theme={theme}>Your one-time sign-in code</Heading>
      <Paragraph theme={theme}>
        {name ? `Hi ${name}, enter` : "Enter"} this code on the sign-in page. It expires in 10 minutes.
      </Paragraph>
      <Text
        style={{
          margin: "4px 0 18px",
          padding: "18px 2px",
          borderTop: `1px solid ${p.line}`,
          borderBottom: `1px solid ${p.line}`,
          textAlign: "center",
          fontFamily: p.mono,
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: "0.35em",
          textIndent: "0.35em",
          color: p.ink,
        }}
      >
        {code}
      </Text>
      <Paragraph theme={theme} muted>
        Didn&apos;t try to sign in? You can safely ignore this email.
      </Paragraph>
    </Shell>
  );
}

LoginCode.PreviewProps = { code: "482913", name: "Alex" };
