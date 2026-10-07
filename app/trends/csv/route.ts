import { getCtx } from "@/lib/context";
import { hasFeature } from "@/lib/features";
import { slugify } from "@/lib/households";
import { loadTrendsCsv } from "@/lib/views";

// The whole history as CSV: one row per month on record, one column per bill type. Members only
// (proxy.ts sends anyone else to /login first), and gone when trends are off.
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return new Response("Forbidden", { status: 403 });
  if (!hasFeature(ctx.household, "trends")) return new Response("Not found", { status: 404 });
  const csv = await loadTrendsCsv(ctx);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(ctx.household.name)}-trends.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
