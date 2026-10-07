// Theme colors live in lib/theme-tokens.ts. The stylesheet can't import it, and the design
// docs are prose with a token header, so this fails the gate when any of them drift from it:
// app/globals.css (statement light and dark, and peach once phase 5 adds its block),
// DESIGN.md's frontmatter colors, and .impeccable/design.json's canonical values. Emails
// import the module directly, so the check there is that no color literal sneaks back in.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { STATEMENT_DARK, THEME_COLORS } from "@/lib/theme-tokens";
import type { Results } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const norm = (c: string) => c.toLowerCase().replace(/\s+/g, "");
const cssVar = (key: string) => `--${key.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase()}`;

type Palette = Record<string, string>;
const SOURCES: Record<string, Palette> = {
  statement: THEME_COLORS.statement,
  "statement-dark": STATEMENT_DARK,
  peach: THEME_COLORS.peach,
};

// DESIGN.md's descriptive slugs → [palette, key]. A slug missing here fails the suite, so a
// new frontmatter color has to be tied to a module value.
const DESIGN_SLUGS: Record<string, [keyof typeof SOURCES, string]> = {
  "statement-paper": ["statement", "page"],
  "statement-sheet": ["statement", "panel"],
  "statement-sheet-tint": ["statement", "panel2"],
  "statement-ink": ["statement", "ink"],
  "statement-ink-muted": ["statement", "inkMuted"],
  "statement-rule": ["statement", "line"],
  "statement-rule-soft": ["statement", "lineSoft"],
  "statement-blue": ["statement", "accent"],
  "statement-blue-deep": ["statement", "primaryHover"],
  "statement-blue-wash": ["statement", "accentSoft"],
  "statement-on-blue": ["statement", "onPrimary"],
  "statement-paid": ["statement", "paid"],
  "statement-paid-wash": ["statement", "paidSoft"],
  "statement-unpaid": ["statement", "unpaid"],
  "statement-unpaid-wash": ["statement", "unpaidSoft"],
  "statement-due-soon": ["statement", "warn"],
  "statement-due-soon-wash": ["statement", "warnSoft"],
  "statement-dark-paper": ["statement-dark", "page"],
  "statement-dark-sheet": ["statement-dark", "panel"],
  "statement-dark-sheet-tint": ["statement-dark", "panel2"],
  "statement-dark-ink": ["statement-dark", "ink"],
  "statement-dark-ink-muted": ["statement-dark", "inkMuted"],
  "statement-dark-blue": ["statement-dark", "accent"],
  "statement-dark-button": ["statement-dark", "primary"],
  "statement-dark-button-hover": ["statement-dark", "primaryHover"],
  "statement-dark-paid": ["statement-dark", "paid"],
  "statement-dark-unpaid": ["statement-dark", "unpaid"],
  "statement-dark-due-soon": ["statement-dark", "warn"],
  "peach-cream": ["peach", "page"],
  "peach-paper": ["peach", "panel"],
  "peach-paper-tint": ["peach", "panel2"],
  "peach-espresso": ["peach", "ink"],
  "peach-espresso-muted": ["peach", "inkMuted"],
  "peach-rule": ["peach", "line"],
  "peach-rule-soft": ["peach", "lineSoft"],
  "peach-deep": ["peach", "accent"],
  "peach-deep-pressed": ["peach", "primaryHover"],
  "peach-blush": ["peach", "accentSoft"],
  "peach-on-deep": ["peach", "onPrimary"],
  "peach-periwinkle": ["peach", "peri"],
  "peach-periwinkle-wash": ["peach", "periSoft"],
  "peach-sage": ["peach", "paid"],
  "peach-sage-wash": ["peach", "paidSoft"],
  "peach-rose": ["peach", "unpaid"],
  "peach-rose-wash": ["peach", "unpaidSoft"],
  "peach-butter": ["peach", "warn"],
  "peach-butter-wash": ["peach", "warnSoft"],
  "peach-awning-stripe": ["peach", "stripeA"],
  "peach-awning-cream": ["peach", "stripeB"],
};

/** Custom properties declared directly inside the first block whose selector matches. */
function block(css: string, selector: RegExp): Map<string, string> | null {
  const m = selector.exec(css);
  if (!m) return null;
  const start = m.index + m[0].length; // just past the selector's "{"
  let depth = 1;
  let i = start;
  for (; i < css.length && depth > 0; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
  }
  const vars = new Map<string, string>();
  for (const d of css.slice(start, i - 1).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) vars.set(d[1], norm(d[2]));
  return vars;
}

function compare(r: Results, label: string, vars: Map<string, string>, palette: Palette) {
  const bad: string[] = [];
  for (const [key, value] of Object.entries(palette)) {
    const v = vars.get(cssVar(key));
    if (v !== norm(value)) bad.push(`${cssVar(key)}: css ${v ?? "(missing)"} ≠ module ${value}`);
  }
  r.check(`${label} matches lib/theme-tokens.ts`, bad.length === 0, bad.join("\n"));
}

export async function tokens(r: Results) {
  r.section("tokens: one source for theme colors");

  const css = read("app/globals.css");
  const light = block(css, /^:root\s*\{/m);
  const dark = block(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\[data-color-scheme="system"\]\s*\{/);
  const peach = block(css, /\[data-theme="peach"\]\s*\{/);
  r.check("globals.css has the statement :root block", !!light);
  r.check("globals.css has the statement dark block", !!dark);
  if (light) compare(r, "globals.css statement", light, THEME_COLORS.statement as Palette);
  if (dark) compare(r, "globals.css statement dark", dark, STATEMENT_DARK as Palette);
  // Peach's block arrives in phase 5; until then DESIGN.md and the module are its only homes.
  if (peach) compare(r, "globals.css peach", peach, THEME_COLORS.peach as Palette);

  const front = read("DESIGN.md").split(/^---$/m)[1] ?? "";
  const colorsYaml = front.split(/^colors:$/m)[1]?.split(/^\S/m)[0] ?? "";
  const design = new Map([...colorsYaml.matchAll(/^\s+([a-z0-9-]+):\s+"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const designBad: string[] = [];
  for (const [slug, value] of design) {
    const ref = DESIGN_SLUGS[slug];
    if (!ref) designBad.push(`${slug}: not mapped to a module key`);
    else if (norm(value) !== norm(SOURCES[ref[0]][ref[1]])) designBad.push(`${slug}: ${value} ≠ module ${SOURCES[ref[0]][ref[1]]}`);
  }
  for (const slug of Object.keys(DESIGN_SLUGS)) if (!design.has(slug)) designBad.push(`${slug}: missing from DESIGN.md`);
  r.check("DESIGN.md frontmatter colors match lib/theme-tokens.ts", design.size > 0 && designBad.length === 0, designBad.join("\n"));

  const sidecar = JSON.parse(read(".impeccable/design.json")) as { extensions: { colorMeta: Record<string, { canonical: string }> } };
  const sidecarBad = [...design].filter(([slug, v]) => norm(sidecar.extensions.colorMeta[slug]?.canonical ?? "") !== norm(v)).map(([s]) => s);
  r.check(".impeccable/design.json colors match DESIGN.md", sidecarBad.length === 0, `stale: ${sidecarBad.join(", ")}`);

  const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
  const hits = readdirSync(path.join(ROOT, "emails"))
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => read(`emails/${f}`).split("\n").map((line, i) => [`emails/${f}:${i + 1}`, line] as const))
    .filter(([, line]) => literal.test(line))
    .map(([where, line]) => `${where}: ${line.trim()}`);
  r.check("emails take every color from lib/theme-tokens.ts", hits.length === 0, hits.join("\n"));
}
