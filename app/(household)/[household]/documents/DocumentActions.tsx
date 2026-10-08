"use client";

import { useState } from "react";
import { removeDocumentAction, updateDocumentAction } from "@/app/(household)/[household]/documents/actions";
import ConfirmButton from "@/app/components/ConfirmButton";
import { PencilIcon, TrashIcon } from "@/app/components/icons";

interface CategoryOption {
  key: string;
  label: string;
  emoji: string;
}

export interface DocumentSummary {
  id: number;
  title: string;
  category: string;
}

/** Admin-only edit (title/category, no re-upload) and delete for one document. */
export default function DocumentActions({
  document,
  categories,
}: {
  document: DocumentSummary;
  categories: CategoryOption[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        title="Edit document"
        aria-label={`Edit ${document.title}`}
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
      </button>

      <form action={removeDocumentAction} className="inline">
        <input type="hidden" name="documentId" value={document.id} />
        <ConfirmButton
          className="btn-icon"
          buttonProps={{ title: "Remove document", "aria-label": `Remove ${document.title}` }}
          title={`Remove ${document.title}?`}
          body="The file is deleted for everyone in the household. This can't be undone."
          confirmLabel="Remove"
          pendingLabel="Removing…"
        >
          <TrashIcon />
        </ConfirmButton>
      </form>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(false);
          }}
        >
          <div className="panel max-h-[85dvh] w-full max-w-md overflow-y-auto p-6 text-left shadow-xl">
            <h3 className="mb-4 text-lg font-bold">Edit document</h3>
            <form action={updateDocumentAction}>
              <input type="hidden" name="documentId" value={document.id} />
              <div>
                <label className="field-label" htmlFor={`title-${document.id}`}>
                  Title
                </label>
                <input
                  className="field-input"
                  id={`title-${document.id}`}
                  name="title"
                  defaultValue={document.title}
                  maxLength={150}
                  required
                  autoFocus
                />
              </div>
              <div className="mt-4">
                <label className="field-label" htmlFor={`category-${document.id}`}>
                  Category
                </label>
                <select
                  className="field-input"
                  id={`category-${document.id}`}
                  name="category"
                  defaultValue={document.category}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                To replace the file itself, add a new document and remove this one.
              </p>
              <div className="mt-6 flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
