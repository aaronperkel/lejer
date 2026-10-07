import { del, get, head, list, put } from "@vercel/blob";
import { slugify } from "@/lib/households";

// This environment's private Blob store (lejer-blob for dev/preview, its own store in
// production). Every key lives under h/{household_id}/ (ARCHITECTURE.md §4):
//   h/{id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf   deterministic per bill; allowOverwrite
//   h/{id}/bills/{year}/{type-slug}/{MMDD}-{billId}-{rev}.pdf   a replacement uploaded by an edit
//   h/{id}/documents/{name}-{randomSuffix}.{ext}          client-direct upload; addRandomSuffix
// The bill id keeps two same-type bills posted the same day from sharing a key. Keys are never
// handed to the browser as Blob URLs; /files/<key> is the only read path.

/** What /files will serve, by extension. No SVG: it can carry script when served inline. */
export const SERVABLE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export const MAX_BILL_PDF_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request cap

export const householdPrefix = (householdId: number) => `h/${householdId}/`;
export const documentsPrefix = (householdId: number) => `h/${householdId}/documents/`;

/**
 * `rev` marks a replacement uploaded by an edit: it never shares the live file's key, so an edit
 * that's refused after the upload (someone paid in the meantime) can't have overwritten it.
 */
export function billPdfKey(householdId: number, typeName: string, billDate: string, billId: number, rev?: string): string {
  const [year, month, day] = billDate.split("-");
  return `h/${householdId}/bills/${year}/${slugify(typeName)}/${month}${day}-${billId}${rev ? `-${rev}` : ""}.pdf`;
}

export function contentTypeFor(key: string): string | undefined {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? undefined : SERVABLE_TYPES[key.slice(dot).toLowerCase()];
}

export function putBillPdf(key: string, body: Blob | ArrayBuffer): Promise<unknown> {
  // The upload's own filename is ignored: providers reuse one name for every statement.
  return put(key, body, { access: "private", contentType: "application/pdf", allowOverwrite: true, addRandomSuffix: false });
}

/** The blob's bytes as a stream, or null when the key doesn't exist. */
export async function readBlob(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const res = await get(key, { access: "private" });
  return res && res.statusCode === 200 ? res.stream : null;
}

export async function blobExists(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const h = await head(key);
    return { size: h.size, contentType: h.contentType };
  } catch {
    return null; // BlobNotFoundError
  }
}

export async function deleteBlob(key: string): Promise<void> {
  await del(key);
}

/** Deletes every blob under a prefix. Returns how many went. */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!/^h\/\d+\/$/.test(prefix) && !/^h\/\d+\/[a-z]+\/$/.test(prefix)) throw new Error(`refusing to delete prefix "${prefix}"`);
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    if (page.blobs.length) {
      await del(page.blobs.map((b) => b.url));
      removed += page.blobs.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}
