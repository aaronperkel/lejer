// Instant shell shown while the dashboard's DB queries run.
// Mirrors page.tsx: header, three-cell summary strip, bill table.
export default function DashboardLoading() {
  return (
    <main aria-busy="true">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="skeleton mb-2 h-7 w-52" />
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-7 w-24" />
          <div className="skeleton h-7 w-20" />
        </div>
      </div>

      <div className="panel mb-8 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-5 py-4">
            <div className="skeleton mb-2 h-3 w-24" />
            <div className="skeleton mb-1.5 h-8 w-28" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>

      <section className="mb-7">
        <div className="mb-2 flex items-center gap-3">
          <div className="skeleton h-3 w-12" />
          <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        </div>
        <div className="panel divide-y divide-line-soft">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between px-4 py-4">
              <div>
                <div className="skeleton mb-1.5 h-4 w-28" />
                <div className="skeleton h-3 w-16" />
              </div>
              <div className="skeleton h-4 w-20" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
