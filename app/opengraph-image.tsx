import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { ogFonts } from "@/lib/mark";
import { THEME_COLORS, flatten } from "@/lib/theme-tokens";

// The link-preview card (1200×630), generated at build time. Drawn as the product looks: a
// statement sheet on grey paper with a few ledger rows (example names, never real data), the
// name from lib/brand.ts and colors from lib/theme-tokens.ts. Fonts come from ogFonts().

export const alt = `${BRAND.name}: split household bills with your roommates`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const t = THEME_COLORS.statement;
const ROWS = [
  { bill: "⚡ Electric", who: "Robin owes Jordan", amount: "$26.03", paid: false },
  { bill: "🔥 Gas", who: "Casey paid Jordan", amount: "$15.60", paid: true },
  { bill: "💧 Water", who: "Morgan owes Casey", amount: "$10.79", paid: false },
  { bill: "📶 Internet", who: "Jordan paid Robin", amount: "$20.00", paid: true },
];

export default async function OpenGraphImage() {
  const { fonts, sans, mono } = await ogFonts();
  const rule = flatten(t.lineSoft, t.panel);
  const headRule = flatten(t.line, t.panel);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "stretch", background: t.page, padding: 64, color: t.ink, fontFamily: sans }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 440, paddingRight: 48 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: 4, color: t.inkMuted, fontWeight: 600 }}>THE HOUSE LEDGER</div>
            <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -4, lineHeight: 1, marginTop: 20 }}>{BRAND.name}</div>
            <div style={{ fontSize: 34, lineHeight: 1.3, color: t.inkMuted, marginTop: 28 }}>Split household bills with your roommates.</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 24, color: t.accent }}>{BRAND.domain}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", background: t.panel, border: `1px solid ${rule}`, borderRadius: 14, padding: "8px 0" }}>
          {ROWS.map((r, i) => (
            <div
              key={r.bill}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "22px 32px",
                borderBottom: i < ROWS.length - 1 ? `2px solid ${i === 0 ? headRule : rule}` : "none",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 30, fontWeight: 600 }}>{r.bill}</div>
                <div style={{ fontSize: 22, color: t.inkMuted, marginTop: 4 }}>{r.who}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: 1.5,
                    color: r.paid ? t.paid : t.unpaid,
                    background: flatten(r.paid ? t.paidSoft : t.unpaidSoft, t.panel),
                    borderRadius: 6,
                    padding: "5px 10px",
                  }}
                >
                  {r.paid ? "PAID" : "UNPAID"}
                </div>
                <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 600 }}>{r.amount}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
