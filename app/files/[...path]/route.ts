import { readBlob } from "@/lib/blob";
import { getCtxForHousehold } from "@/lib/context";
import { authorizeFile, keyHouseholdId } from "@/lib/files";

// The only read path into the private Blob store. lib/files.ts decides; this streams.
export async function GET(_req: Request, { params }: RouteContext<"/files/[...path]">) {
  const key = (await params).path.join("/");
  const householdId = keyHouseholdId(key);
  const decision = await authorizeFile(householdId === null ? null : await getCtxForHousehold(householdId), key);
  if (!decision.ok) return new Response(decision.status === 403 ? "Forbidden" : "Not found", { status: decision.status });

  const stream = await readBlob(key);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, {
    headers: {
      "Content-Type": decision.contentType,
      "Content-Disposition": `inline; filename="${key.split("/").pop()}"`,
      "Cache-Control": "private, max-age=3600",
      // User-uploaded bytes: never let a browser sniff its way to a scriptable type.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
