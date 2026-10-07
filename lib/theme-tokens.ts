// Theme colors, in one place. Keys mirror the CSS custom properties in app/globals.css
// (`inkMuted` is `--ink-muted`). emails/Shell.tsx reads them directly; the stylesheet can't
// import TypeScript, so the `tokens` verify suite fails the gate if globals.css, DESIGN.md's
// frontmatter or .impeccable/design.json disagrees with this file. Change a color here first.
// Plain constants, so email templates (rendered outside Next) can import it too.
//
// Peach is the corrected spec phase 5 ports (DESIGN.md, Colors > Contrast): muted ink, the
// accent and the four status inks are darker than peach-cob's originals so every text pair
// clears 4.5:1 on both the cream page and the panel.

/**
 * Chart series (trends), data-only: never a link, a button or a status. Five fixed slots per
 * theme, assigned to bill types in order and never cycled; a sixth type onward folds into
 * "Other" in muted ink. No green, red or amber (reserved for paid/unpaid/due soon), and slot 1
 * is the theme's accent. Each palette passes the dataviz validator for its surface (lightness
 * band, chroma floor, protan/deutan separation of neighbors, 3:1 on the panel); see DESIGN.md,
 * Colors > Data series.
 */
const SERIES = {
  statement: { series1: "#1d5fd6", series2: "#8c2f6e", series3: "#2e9fd0", series4: "#5b3fa8", series5: "#c2418f" },
  statementDark: { series1: "#4f86e8", series2: "#b4508f", series3: "#3aa0d0", series4: "#7f66d8", series5: "#d465a5" },
  peach: { series1: "#b45031", series2: "#51609e", series3: "#9a3f6b", series4: "#3e5fb0", series5: "#c06090" },
} as const;

/** Number of chart series slots; types past this fold into "Other". */
export const SERIES_SLOTS = 5;

export const THEME_COLORS = {
  statement: {
    page: "#f4f5f6",
    panel: "#ffffff",
    panel2: "#f8f9fb",
    ink: "#1b2530",
    inkMuted: "#5b6875",
    line: "rgba(27, 37, 48, 0.16)",
    lineSoft: "rgba(27, 37, 48, 0.08)",
    accent: "#1d5fd6",
    accentSoft: "rgba(29, 95, 214, 0.1)",
    primary: "#1d5fd6",
    primaryHover: "#174db3",
    onPrimary: "#ffffff",
    paid: "#187a4b",
    paidSoft: "rgba(24, 122, 75, 0.12)",
    unpaid: "#c03538",
    unpaidSoft: "rgba(192, 53, 56, 0.1)",
    warn: "#8a5b00",
    warnSoft: "rgba(216, 146, 0, 0.16)",
    ...SERIES.statement,
  },
  peach: {
    page: "#faf3e7",
    panel: "#fffcf7",
    panel2: "#f5ead9",
    ink: "#43302b",
    inkMuted: "#7a6559",
    line: "rgba(67, 48, 43, 0.22)",
    lineSoft: "rgba(67, 48, 43, 0.1)",
    accent: "#b45031",
    accentSoft: "rgba(231, 138, 104, 0.16)",
    primary: "#b45031",
    primaryHover: "#a34527",
    onPrimary: "#fff6ec",
    peri: "#51609e",
    periSoft: "rgba(95, 111, 174, 0.13)",
    paid: "#406c45",
    paidSoft: "rgba(94, 133, 90, 0.16)",
    unpaid: "#ae413a",
    unpaidSoft: "rgba(177, 68, 61, 0.1)",
    warn: "#845e09",
    warnSoft: "rgba(216, 166, 42, 0.2)",
    stripeA: "#eb9a76",
    stripeB: "#f8e3d3",
    ...SERIES.peach,
  },
} as const;

/** Statement's dark values (data-color-scheme="system" under prefers-color-scheme: dark). */
export const STATEMENT_DARK = {
  page: "#14181d",
  panel: "#1b2128",
  panel2: "#20262e",
  ink: "#e4eaf0",
  inkMuted: "#99a5b1",
  line: "rgba(228, 234, 240, 0.16)",
  lineSoft: "rgba(228, 234, 240, 0.08)",
  accent: "#82abf3",
  accentSoft: "rgba(130, 171, 243, 0.13)",
  primary: "#3168d5",
  primaryHover: "#2358c4", // deeper on hover, as in light mode: white clears 6.4:1
  onPrimary: "#ffffff",
  paid: "#52c48a",
  paidSoft: "rgba(82, 196, 138, 0.14)",
  unpaid: "#ee7378",
  unpaidSoft: "rgba(238, 115, 120, 0.12)",
  warn: "#e0b24c",
  warnSoft: "rgba(224, 178, 76, 0.14)",
  ...SERIES.statementDark,
} as const;

/** The awning's stripe width, shared by the app's .awning and the email masthead stripe. */
export const AWNING_STRIPE_PX = 14;

/** `rgba(...)` flattened onto an opaque hex background, for email clients that mangle alpha. */
export function flatten(color: string, background: string): string {
  const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) return color;
  const bg = background.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!bg) throw new Error(`flatten: background must be #rrggbb, got ${background}`);
  const a = Number(m[4]);
  return `#${[1, 2, 3]
    .map((i) => Math.round(a * Number(m[i]) + (1 - a) * parseInt(bg[i], 16)).toString(16).padStart(2, "0"))
    .join("")}`;
}
