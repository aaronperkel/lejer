import { withHousehold, withUser } from "@/lib/db";
import { buildCalendar, isCalendarToken } from "@/lib/ics";

// The public, personal calendar feed: /cal.ics?k=<calendar_token>. Calendar apps fetch it with
// no session, so the token is the only key. calendar_context() (SECURITY DEFINER, executable by
// lejer_app only) maps it to (household, membership) and nothing more; the feed is then built
// inside withHousehold for that household, so RLS keeps it there. A malformed, reset or removed
// token gets the same empty 404, and responses are cached by the client only (never a shared
// cache), so a reset link stops working at once. ARCHITECTURE.md §4.

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const k = new URL(request.url).searchParams.get("k");
  if (!isCalendarToken(k)) return NOT_FOUND();

  const [scope] = await withUser(null, (tx) => tx<{ householdId: number; membershipId: number }[]>`
    SELECT household_id AS "householdId", membership_id AS "membershipId" FROM calendar_context(${k})`);
  if (!scope) return NOT_FOUND();

  const ics = await withHousehold({ household: { id: scope.householdId }, user: null }, (tx) => buildCalendar(tx, scope.membershipId));
  if (!ics) return NOT_FOUND();
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="bills.ics"',
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
