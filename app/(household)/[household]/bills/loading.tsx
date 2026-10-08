// Instant shell for /{slug}/bills: the page header + skeleton body.
export default function BillsLoading() {
  return (
    <main aria-busy="true">
      <header className="mb-6">
        <div className="skeleton mb-2 h-3 w-24" />
        <h1 className="page-title">Bills</h1>
      </header>

      <div className="mb-2 flex items-center gap-3">
        <div className="skeleton h-3 w-28" />
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="panel mb-8 flex flex-wrap gap-6 px-5 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="skeleton mb-1.5 h-3 w-16" />
            <div className="skeleton h-5 w-20" />
          </div>
        ))}
      </div>

      <div className="mb-2 flex items-center gap-3">
        <div className="skeleton h-3 w-20" />
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="panel divide-y divide-line-soft">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="skeleton mb-1.5 h-4 w-28" />
              <div className="skeleton h-3 w-16" />
            </div>
            <div className="skeleton h-4 w-32" />
          </div>
        ))}
      </div>
    </main>
  );
}
