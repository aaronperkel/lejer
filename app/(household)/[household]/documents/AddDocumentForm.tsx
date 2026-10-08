"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDocument } from "@/app/(household)/[household]/documents/actions";

interface CategoryOption {
  key: string;
  label: string;
  emoji: string;
}

/** Browsers report an empty type for HEIC (and some scanner PDFs); the extension is the better signal. */
const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif",
};

const resolveContentType = (file: File) => EXT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type;

/** Blob keys tolerate less than filenames do; keep them boring. */
function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9.\-_]/g, "-").replace(/-+/g, "-").replace(/^[.-]+/, "") || "document";
}

/**
 * Two-phase add: the file goes browser → Blob directly (no 4.5 MB function cap), under the
 * household's documents prefix (the upload route refuses anything else), then a small action
 * records the row after confirming the blob exists.
 */
export default function AddDocumentForm({ categories, maxBytes, prefix }: { categories: CategoryOption[]; maxBytes: number; prefix: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const maxLabel = `${Math.round(maxBytes / (1024 * 1024))} MB`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const title = String(data.get("title") ?? "").trim();
    const category = String(data.get("category") ?? "");
    const problems: string[] = [];
    if (!title) problems.push("Give the document a title.");
    if (!category) problems.push("Pick a category.");
    if (!(file instanceof File) || file.size === 0) problems.push("Choose a file.");
    else if (file.size > maxBytes) problems.push(`Documents can be up to ${maxLabel}.`);
    else if (!Object.values(EXT_TYPES).includes(resolveContentType(file))) problems.push("Only PDF, PNG, JPEG and HEIC files.");
    if (problems.length) return setErrors(problems);

    const doc = file as File;
    setPending(true);
    setErrors([]);
    setProgress(0);
    try {
      const blob = await upload(`${prefix}${sanitizeName(doc.name)}`, doc, {
        access: "private",
        contentType: resolveContentType(doc),
        handleUploadUrl: "/api/documents/upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      const result = await addDocument({ title, category, filePath: blob.pathname });
      if (result.errors.length) return setErrors(result.errors);
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setErrors([`Upload failed: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex justify-end">
        <button type="button" className={`btn btn-sm ${open ? "" : "btn-primary"}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close" : "+ Add document"}
        </button>
      </div>
      {open && (
        <div className="panel p-5">
          {errors.length > 0 && (
            <div className="flash flash-err" role="alert">
              <ul className="list-disc pl-5">
                {errors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="doc-title">Title</label>
                <input className="field-input" id="doc-title" name="title" maxLength={150} placeholder="Lease 2026–2027" required />
              </div>
              <div>
                <label className="field-label" htmlFor="doc-category">Category</label>
                <select id="doc-category" name="category" required className="field-input" defaultValue="">
                  <option value="" disabled>Select…</option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="field-label" htmlFor="doc-file">File</label>
              <input className="field-input" type="file" id="doc-file" name="file" accept={[...new Set(Object.values(EXT_TYPES))].join(",")} required />
              <small className="text-xs text-ink-muted">PDF, PNG, JPEG or HEIC, up to {maxLabel}.</small>
            </div>
            {progress !== null && (
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-(--radius-sm) bg-panel-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} />
                </div>
                <small className="figure text-xs text-ink-muted">Uploading… {Math.round(progress)}%</small>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Uploading…" : "Save document"}</button>
              <button type="button" className="btn" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
