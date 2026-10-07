import { assertAdmin } from "@/lib/auth";
import { blobExists, contentTypeFor, documentsPrefix } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { ActionError } from "@/lib/errors";

// Household paperwork (lease, insurance, …), behind feature_documents. Everyone reads; admins
// manage. Bytes go browser → Blob directly (app/api/documents/upload), always under
// h/{household}/documents/; this module records and edits the rows.

/** A fixed code-side list: categories carry no math, so they don't earn a table. */
export const DOCUMENT_CATEGORIES = [
  { key: "lease", label: "Lease", emoji: "📄" },
  { key: "insurance", label: "Insurance", emoji: "🛡️" },
  { key: "utilities", label: "Utilities", emoji: "💡" },
  { key: "other", label: "Other", emoji: "📎" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** No image/svg+xml: SVGs can carry script when served inline. */
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/heic", "image/heif"] as const;

export interface HouseholdDocument {
  id: number;
  title: string;
  category: string;
  filePath: string;
  contentType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByName: string | null;
}

export function getDocuments(tx: Tx): Promise<HouseholdDocument[]> {
  return tx<HouseholdDocument[]>`
    SELECT d.id, d.title, d.category, d.file_path AS "filePath", d.content_type AS "contentType",
           d.file_size AS "fileSize", d.uploaded_at AS "uploadedAt", u.name AS "uploadedByName"
    FROM documents d
    LEFT JOIN memberships m ON m.id = d.uploaded_by
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY d.title`;
}

/** Unknown keys fall back to "Other" so a hand-edited row can't break the page. */
export function categoryFor(key: string): DocumentCategory {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key) ?? DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1];
}

const isCategory = (key: string) => DOCUMENT_CATEGORIES.some((c) => c.key === key);

/** True only for keys this household's documents may use. */
export function isDocumentKey(householdId: number, key: string): boolean {
  return key.startsWith(documentsPrefix(householdId)) && !key.includes("..") && contentTypeFor(key) !== undefined;
}

export function fileKindLabel(contentType: string): string {
  const sub = contentType.split("/")[1] ?? contentType;
  return sub === "jpeg" ? "JPG" : sub.toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface NewDocument {
  title: string;
  category: string;
  filePath: string;
}

/**
 * Validates an uploaded document and confirms its bytes exist in Blob under this household's
 * prefix. Size and type come from Blob, not from the browser. Runs outside any transaction
 * (it's a network call); insertDocument records the result.
 */
export async function checkUploadedDocument(ctx: Ctx, input: NewDocument): Promise<{ contentType: string; fileSize: number }> {
  assertAdmin(ctx);
  const title = input.title.trim();
  if (!title || title.length > 150) throw new ActionError("Give the document a title (up to 150 characters).");
  if (!isCategory(input.category)) throw new ActionError("Pick a category.");
  if (!isDocumentKey(ctx.household.id, input.filePath)) throw new ActionError("That upload landed somewhere unexpected. Try again.");
  const blob = await blobExists(input.filePath);
  if (!blob) throw new ActionError("Couldn't find the uploaded file. Try again.");
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(blob.contentType)) throw new ActionError("Only PDF and image files are allowed.");
  if (blob.size <= 0 || blob.size > MAX_DOCUMENT_BYTES) throw new ActionError("Documents can be up to 25 MB.");
  return { contentType: blob.contentType, fileSize: blob.size };
}

export async function insertDocument(tx: Tx, ctx: Ctx, input: NewDocument, blob: { contentType: string; fileSize: number }): Promise<void> {
  assertAdmin(ctx);
  await tx`
    INSERT INTO documents (household_id, title, category, file_path, content_type, file_size, uploaded_by)
    VALUES (${ctx.household.id}, ${input.title.trim()}, ${input.category}, ${input.filePath}, ${blob.contentType},
            ${blob.fileSize}, ${ctx.membership.id})`;
}

/** Title and category only: fixing a typo shouldn't mean re-uploading a scan. */
export async function updateDocument(tx: Tx, ctx: Ctx, id: number, title: string, category: string): Promise<string> {
  assertAdmin(ctx);
  const t = title.trim();
  if (!t || t.length > 150) throw new ActionError("Give the document a title (up to 150 characters).");
  if (!isCategory(category)) throw new ActionError("Pick a category.");
  const rows = await tx`UPDATE documents SET title = ${t}, category = ${category} WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) throw new ActionError("That document no longer exists.");
  return t;
}

/** Deletes the row and returns its key, for the caller to delete from Blob after commit. */
export async function removeDocument(tx: Tx, ctx: Ctx, id: number): Promise<{ title: string; filePath: string }> {
  assertAdmin(ctx);
  const [doc] = await tx<{ title: string; filePath: string }[]>`
    DELETE FROM documents WHERE id = ${id} RETURNING title, file_path AS "filePath"`;
  if (!doc) throw new ActionError("That document no longer exists.");
  return doc;
}
