import type { ReactNode } from "react";
import { Body, Column, Container, Head, Html, Link, Preview, Row, Section, Text } from "@react-email/components";
import type { Theme } from "../lib/types";

// The wrapper every email renders in, in the household's theme. Inline styles only
// (clients ignore stylesheets), light only (client dark modes are unreliable), 560 px.
// statement: grey page, white panel, mono eyebrows (utilities). peach: cream paper, the
// awning stripe, Georgia + Courier (peach-cob). Colors mirror the light tokens in globals.css.

const PALETTES = {
  statement: {
    page: "#f4f5f6", panel: "#ffffff", ink: "#1b2530", muted: "#5b6875",
    line: "#dfe2e6", accent: "#1d5fd6", onAccent: "#ffffff", unpaid: "#c03538",
    body: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
    mono: "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace",
    headingSize: 19, bodySize: 14, stripe: null as string | null,
  },
  peach: {
    page: "#faf3e7", panel: "#fffcf7", ink: "#43302b", muted: "#8a7468",
    line: "#dcc9b4", accent: "#b95536", onAccent: "#fffcf7", unpaid: "#b1443d",
    body: "Georgia,'Times New Roman',serif",
    mono: "'Courier New',Courier,monospace",
    headingSize: 22, bodySize: 15,
    stripe: "repeating-linear-gradient(90deg,#e78a68 0,#e78a68 12px,#f8ddce 12px,#f8ddce 24px)",
  },
} as const;

export type Palette = (typeof PALETTES)[Theme];
export const palette = (theme: Theme): Palette => PALETTES[theme] ?? PALETTES.statement;

export function Shell({
  theme,
  masthead,
  footer,
  contact,
  preview,
  children,
}: {
  theme: Theme;
  masthead: string; // BRAND.name, or "{name} · {household}"
  footer: string;
  contact?: string | null; // reply address shown in the footer
  preview: string;
  children: ReactNode;
}) {
  const p = palette(theme);
  const small = { fontFamily: p.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: p.muted, margin: 0 };
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "28px 16px", background: p.page }}>
        <Container style={{ width: "100%", maxWidth: 560 }}>
          <Text style={{ ...small, fontWeight: 600, padding: "0 6px 10px" }}>{masthead}</Text>
          {p.stripe && (
            <Section style={{ height: 8, borderRadius: "10px 10px 0 0", backgroundColor: "#e78a68", backgroundImage: p.stripe }} />
          )}
          <Section
            style={{
              background: p.panel,
              border: `1px solid ${p.line}`,
              borderTop: p.stripe ? 0 : `1px solid ${p.line}`,
              borderRadius: p.stripe ? "0 0 10px 10px" : 10,
              padding: "26px 28px",
            }}
          >
            {children}
          </Section>
          <Section style={{ padding: "14px 6px 0" }}>
            <Text style={{ ...small, letterSpacing: "0.1em" }}>
              {footer}
              {contact && (
                <>
                  {" · "}
                  <Link href={`mailto:${contact}`} style={{ color: p.accent, textDecoration: "none", textTransform: "none" }}>
                    {contact}
                  </Link>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function Eyebrow({ theme, urgent, children }: { theme: Theme; urgent?: boolean; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: urgent ? p.unpaid : p.muted, margin: "0 0 10px" }}>
      {children}
    </Text>
  );
}

export function Heading({ theme, children }: { theme: Theme; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.body, fontSize: p.headingSize, fontWeight: 700, color: p.ink, margin: "0 0 14px", lineHeight: 1.3 }}>
      {children}
    </Text>
  );
}

export function Paragraph({ theme, muted, children }: { theme: Theme; muted?: boolean; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.body, fontSize: muted ? 13 : p.bodySize, lineHeight: 1.55, color: muted ? p.muted : p.ink, margin: "0 0 14px" }}>
      {children}
    </Text>
  );
}

export function ButtonLink({ theme, href, children }: { theme: Theme; href: string; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Link
      href={href}
      style={{ display: "inline-block", padding: "9px 16px", background: p.accent, color: p.onAccent, border: `1px solid ${p.accent}`, borderRadius: 7, fontFamily: p.body, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}


/** Ruled label/value rows, the email cousin of the site's .data-table. */
export function Rows({ theme, rows }: { theme: Theme; rows: { label: string; value: string; strong?: boolean; urgent?: boolean }[] }) {
  const p = palette(theme);
  return (
    <Section style={{ margin: "4px 0 18px", borderTop: `1px solid ${p.line}`, borderBottom: `1px solid ${p.line}` }}>
      {rows.map((r, i) => (
        <Row key={r.label} style={{ borderTop: i === 0 ? undefined : `1px solid ${p.line}` }}>
          <Column style={{ padding: "9px 2px", fontFamily: p.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: p.muted }}>
            {r.label}
          </Column>
          <Column align="right" style={{ padding: "9px 2px", fontFamily: p.mono, fontSize: r.strong ? 15 : 13, fontWeight: r.strong ? 700 : 400, color: r.urgent ? p.unpaid : p.ink }}>
            {r.value}
          </Column>
        </Row>
      ))}
    </Section>
  );
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-10-14" → "October 14, 2026" (no timezone shift: it's a calendar date). */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Robin, Jordan & Casey". */
export function nameList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
