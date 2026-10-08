import { contentTypeFor, householdPrefix } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";

// Authorization for /files/<key>, the only read path into Blob (ARCHITECTURE.md §4). The key
// names its household (h/{id}/), and the requester must be a member of it (getCtxForHousehold);
// then three locks: the key must sit under that household's prefix, carry an allowlisted
// extension, and be recorded in bills.pdf_path or documents.file_path, a lookup that runs
// inside withHousehold so RLS hides every other household's rows even if the prefix check
// were wrong. Every refusal past sign-in is a 404, so a key never confirms it exists.

export type FileDecision = { ok: true; contentType: string } | { ok: false; status: 403 | 404 };

/** The household id a stored key names (h/{id}/…), or null. */
export function keyHouseholdId(key: string): number | null {
  const m = /^h\/(\d+)\//.exec(key);
  return m ? Number(m[1]) : null;
}

export async function authorizeFile(ctx: Ctx | null, key: string): Promise<FileDecision> {
  if (!ctx) return { ok: false, status: 404 };
  if (ctx.demo) return { ok: false, status: 404 }; // the demo household has no files
  if (!key.startsWith(householdPrefix(ctx.household.id)) || key.includes("..")) return { ok: false, status: 404 };
  const contentType = contentTypeFor(key);
  if (!contentType) return { ok: false, status: 404 };
  const known = await withHousehold(ctx, async (tx) => {
    const [row] = await tx`
      SELECT 1 FROM bills WHERE pdf_path = ${key}
      UNION ALL
      SELECT 1 FROM documents WHERE file_path = ${key}
      LIMIT 1`;
    return !!row;
  });
  return known ? { ok: true, contentType } : { ok: false, status: 404 };
}

/** /files/<key> for a stored key (each segment URL-encoded). */
export function fileHref(key: string): string {
  return `/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}
