import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/context";
import { DEMO_COOKIE, DEMO_DAYS, cookieOptions, createDemoToken } from "@/lib/session";

// GET /demo: no account needed. Sets the demo cookie (lib/demo.ts serves the household)
// and opens the dashboard. Someone already signed in is shown /demo/signed-in instead of being
// dropped into the demo or silently back into their own household.
export async function GET(req: NextRequest) {
  if (await getSessionUser()) return NextResponse.redirect(new URL("/demo/signed-in", req.url));
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(DEMO_COOKIE, await createDemoToken(), cookieOptions(DEMO_DAYS));
  return res;
}
