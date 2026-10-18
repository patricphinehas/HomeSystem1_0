/** Shared page shell: a compact two-column matrix that fills the pane. */

export function PageGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid w-full min-w-0 grid-cols-1 gap-3 *:min-w-0 lg:grid-cols-2">{children}</div>;
}

export function PageHeader({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 lg:col-span-full">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </header>
  );
}

/** A cell that occupies the whole row of the page grid. */
export function Span({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 lg:col-span-full">{children}</div>;
}
