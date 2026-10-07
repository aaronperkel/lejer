import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, isDocumentKey } from "@/lib/documents";

/**
 * Token handshake for client-direct document uploads: the browser sends the file straight to
 * Blob, so it isn't bounded by the 4.5 MB function body cap. Public in proxy.ts because Blob's
 * upload-completed callback carries no cookie; the token request itself requires an admin.
 *
 * The client token is bound to the pathname the browser asks for, and handleUpload can't
 * substitute another, so instead of rewriting we refuse anything outside this household's
 * h/{id}/documents/ prefix. The page tells the browser that prefix.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const ctx = await requireAdminAction();
        if (ctx.demo) throw new Error("The demo is read-only.");
        if (!ctx.household.featureDocuments) throw new Error("Documents are turned off for this household.");
        if (!isDocumentKey(ctx.household.id, pathname)) throw new Error("Documents must be uploaded under this household's documents/ prefix.");
        return {
          allowedContentTypes: [...ALLOWED_DOCUMENT_TYPES],
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          addRandomSuffix: true, // two "policy.pdf"s coexist
        };
      },
      // Never fires against localhost; addDocument() head()s the key and records the row.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    // The client reports every refusal as "Failed to retrieve the client token"; log the cause.
    console.error("Document upload token refused:", message);
    const status = /sign in|admin access/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
