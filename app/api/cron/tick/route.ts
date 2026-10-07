import { type NextRequest, NextResponse } from "next/server";
import { authorizeCron, tick } from "@/lib/cron";

// The hourly tick, pinged by .github/workflows/tick.yml (ARCHITECTURE.md §8). The endpoint owns
// the schedule: each household sends on the first tick at or after its own send hour, once per
// local day, so a dropped GitHub run only delays mail. Public in proxy.ts; the bearer secret is
// the lock.

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = authorizeCron(req.headers.get("authorization"));
  if (auth === "missing") return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  if (auth === "denied") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const report = await tick();
  return NextResponse.json({ ok: report.status === 200, households: report.households }, { status: report.status });
}
