import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Flash from "@/app/components/Flash";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import AddDocumentForm from "@/app/(app)/documents/AddDocumentForm";
import DocumentActions from "@/app/(app)/documents/DocumentActions";
import { requireUser } from "@/lib/auth";
import { documentsPrefix } from "@/lib/blob";
import { withHousehold } from "@/lib/db";
import { DOCUMENT_CATEGORIES, type HouseholdDocument, MAX_DOCUMENT_BYTES, categoryFor, fileKindLabel, formatFileSize, getDocuments } from "@/lib/documents";
import { fileHref } from "@/lib/files";

export const metadata: Metadata = { title: "Documents" };

// Household paperwork, behind feature_documents: everyone reads, admins manage. Files stream
// from Blob through /files/<key>; Blob URLs never reach the browser.
export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const ctx = await requireUser();
  if (!ctx.household.featureDocuments) notFound();
  const { ok, err } = await searchParams;
  const isAdmin = ctx.membership.role === "admin" && !ctx.demo;
  const documents: HouseholdDocument[] = ctx.demo ? [] : await withHousehold(ctx, (tx) => getDocuments(tx));
  const categories = DOCUMENT_CATEGORIES.map((c) => ({ ...c }));
  const groups = categories
    .map((c) => ({ category: c, docs: documents.filter((d) => categoryFor(d.category).key === c.key) }))
    .filter((g) => g.docs.length > 0);
  const added = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: ctx.household.timezone });

  return (
    <main>
      <div className="mb-6">
        <span className="eyebrow mb-1">{ctx.household.name}</span>
        <h1 className="page-title">Documents</h1>
        <p className="text-sm text-ink-muted">The lease, insurance and other paperwork, in one place.</p>
      </div>
      <Flash ok={ok} err={err} />

      {isAdmin && <AddDocumentForm categories={categories} maxBytes={MAX_DOCUMENT_BYTES} prefix={documentsPrefix(ctx.household.id)} />}

      {documents.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-ink-muted">
          {isAdmin ? "No documents yet. Add the lease or the insurance policy to start." : "No documents have been added yet."}
        </div>
      ) : (
        groups.map(({ category, docs }) => (
          <section key={category.key} className="mb-7">
            <div className="mb-2 flex items-center gap-3">
              <span className="eyebrow">
                {category.emoji} {category.label}
              </span>
              <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
            </div>
            <div className="panel overflow-x-auto">
              <table className="data-table table-stack table-stack-docs">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Kind</th>
                    <th>Added</th>
                    <th className="num">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const href = fileHref(doc.filePath);
                    return (
                      <tr key={doc.id}>
                        <td className="cell-doc">
                          <div className="font-medium">{doc.title}</div>
                          <div className="figure text-xs text-ink-muted">
                            {formatFileSize(doc.fileSize)}
                            {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                          </div>
                        </td>
                        <td className="cell-kind">
                          <span className="tag bg-accent-soft text-accent">{fileKindLabel(doc.contentType)}</span>
                        </td>
                        <td className="cell-uploaded">
                          <span className="figure text-xs text-ink-muted">{added(doc.uploadedAt)}</span>
                        </td>
                        <td className="num cell-actions">
                          <div className="flex justify-end gap-1.5">
                            <a href={href} target="_blank" className="btn-icon" title="View document" aria-label={`View ${doc.title}`}>
                              <EyeIcon />
                            </a>
                            <a href={href} download className="btn-icon" title="Download document" aria-label={`Download ${doc.title}`}>
                              <DownloadIcon />
                            </a>
                            {isAdmin && <DocumentActions document={{ id: doc.id, title: doc.title, category: categoryFor(doc.category).key }} categories={categories} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
