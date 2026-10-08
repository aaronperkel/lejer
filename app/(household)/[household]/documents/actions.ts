"use server";

import { revalidatePath } from "next/cache";
import { requireUserAction } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { checkUploadedDocument, insertDocument, removeDocument, updateDocument } from "@/lib/documents";
import { ActionError } from "@/lib/errors";
import { done, fail } from "@/lib/flash";
import { householdPath } from "@/lib/paths";

const docs = (ctx: Ctx) => householdPath(ctx.household, "/documents");

async function docsCtx(): Promise<Ctx> {
  const ctx = await requireUserAction();
  if (ctx.demo) fail(docs(ctx), DEMO_REFUSAL);
  if (!ctx.household.featureDocuments) fail(docs(ctx), "Documents are turned off for this household.");
  return ctx;
}

/**
 * Records a document whose bytes the browser already put in Blob. Returns errors rather than
 * redirecting: the client component owns the upload → save flow and shows them inline.
 */
export async function addDocument(input: { title: string; category: string; filePath: string }): Promise<{ errors: string[] }> {
  try {
    const ctx = await requireUserAction();
    if (ctx.demo) return { errors: [DEMO_REFUSAL] };
    const blob = await checkUploadedDocument(ctx, input);
    await withHousehold(ctx, (tx) => insertDocument(tx, ctx, input, blob));
    revalidatePath(docs(ctx));
  } catch (e) {
    if (e instanceof ActionError) return { errors: [e.message] };
    if (e instanceof Error && /sign in|admin/i.test(e.message)) return { errors: ["Only a household admin can add documents."] };
    throw e;
  }
  return { errors: [] };
}

export async function updateDocumentAction(formData: FormData): Promise<void> {
  const ctx = await docsCtx();
  let title: string;
  try {
    title = await withHousehold(ctx, (tx) =>
      updateDocument(tx, ctx, Number(formData.get("documentId")), String(formData.get("title") ?? ""), String(formData.get("category") ?? "")),
    );
  } catch (e) {
    if (e instanceof ActionError) fail(docs(ctx), e.message);
    throw e;
  }
  done(docs(ctx), `Updated ${title}.`);
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  const ctx = await docsCtx();
  let doc: { title: string; filePath: string };
  try {
    doc = await withHousehold(ctx, (tx) => removeDocument(tx, ctx, Number(formData.get("documentId"))));
  } catch (e) {
    if (e instanceof ActionError) fail(docs(ctx), e.message);
    throw e;
  }
  // The row is gone either way; a stale blob is recoverable, a dangling row is not.
  await deleteBlob(doc.filePath).catch((err) => console.error("Blob delete failed for", doc.filePath, err));
  done(docs(ctx), `Removed ${doc.title}.`);
}
