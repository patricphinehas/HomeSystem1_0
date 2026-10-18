/** Shown at once while the next route segment streams in. Static markup, no data. */

export default function Loading() {
  return (
    <div className="grid min-w-0 gap-3" aria-busy="true" aria-live="polite" aria-label="Loading page">
      <div className="h-7 w-40 rounded-lg bg-surface" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
