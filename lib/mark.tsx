import { BRAND } from "@/lib/brand";
import { THEME_COLORS } from "@/lib/theme-tokens";

// The stand-in mark for browser tabs and home screens until the final brand brings a real one
// (DESIGN.md: no logo in the app itself). Typographic and rename-safe: the product name's
// initial on statement blue, over the double rule a ledger draws under a total. Rendered by
// next/og (app/icon.tsx, app/apple-icon.tsx), so plain inline styles only.

const t = THEME_COLORS.statement;

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: "normal" };

async function google(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * IBM Plex Sans for words and IBM Plex Mono for figures (statement's ledger face), fetched at
 * build time. Anything that fails to load is left out and the image falls back to the bundled
 * sans rather than failing the build.
 */
export async function ogFonts(): Promise<{ fonts: OgFont[]; sans?: string; mono?: string }> {
  const want = [
    ["Sans", "IBM+Plex+Sans", 400],
    ["Sans", "IBM+Plex+Sans", 700],
    ["Mono", "IBM+Plex+Mono", 400],
    ["Mono", "IBM+Plex+Mono", 600],
  ] as const;
  const loaded = await Promise.all(want.map(([, family, w]) => google(family, w)));
  const fonts: OgFont[] = [];
  want.forEach(([name, , weight], i) => {
    const data = loaded[i];
    if (data) fonts.push({ name, data, weight, style: "normal" });
  });
  const has = (n: string) => fonts.some((f) => f.name === n);
  return { fonts, sans: has("Sans") ? "Sans" : undefined, mono: has("Mono") ? "Mono" : undefined };
}

export function Mark({ size, rounded, font }: { size: number; rounded: boolean; font?: string }) {
  const rule = Math.max(1, Math.round(size / 28));
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: t.accent,
        color: t.onPrimary,
        fontFamily: font,
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
      }}
    >
      <div style={{ fontSize: Math.round(size * 0.62), fontWeight: 700, lineHeight: 1, marginTop: Math.round(size * 0.04) }}>
        {BRAND.name.charAt(0).toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: rule, marginTop: Math.round(size * 0.05) }}>
        <div style={{ width: Math.round(size * 0.46), height: rule, background: t.onPrimary }} />
        <div style={{ width: Math.round(size * 0.46), height: rule, background: t.onPrimary }} />
      </div>
    </div>
  );
}
