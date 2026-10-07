export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading trends">
      <div className="skeleton mb-2 h-7 w-32" />
      <div className="skeleton mb-6 h-4 w-72" />
      <div className="panel mb-8 p-5">
        <div className="mb-4 flex gap-2">
          <div className="skeleton h-8 w-24" />
          <div className="skeleton h-8 w-20" />
          <div className="skeleton h-8 w-24" />
        </div>
        <div className="skeleton h-[260px] sm:h-[340px]" />
      </div>
    </main>
  );
}
