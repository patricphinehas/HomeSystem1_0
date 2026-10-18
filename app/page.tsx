"use client";

import Link from "next/link";
import { isLow, lowStock, totals } from "@/lib/inventory";
import { useInventory } from "./use-inventory";
import { Notice, Skeleton } from "./ui";
import { PageGrid, PageHeader, Span } from "./page-frame";

const LABELS: Record<string, string> = {
  categories: "categories",
  items: "items tracked",
  low: "running low",
  out: "out of stock",
};

export default function Overview() {
  const { inv, error } = useInventory();
  const low = inv ? lowStock(inv) : [];

  return (
    <PageGrid>
      <PageHeader title="Overview" hint="What the house has, and what it is about to run out of." />

      {error && (
        <Span>
          <Notice>{error}</Notice>
        </Span>
      )}
      {!inv && !error && (
        <Span>
          <Skeleton rows={2} />
        </Span>
      )}

      {inv && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:col-span-full">
            {Object.entries(totals(inv)).map(([key, value]) => (
              <div key={key} className="bg-surface px-3 py-3">
                <dd className="font-mono text-xl tabular-nums">{value}</dd>
                <dt className="mt-1 text-xs text-muted capitalize">{LABELS[key]}</dt>
              </div>
            ))}
          </dl>

          <section className="grid content-start gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Buy next</h2>
              <Link href="/inventory" className="text-xs text-accent hover:underline">
                Open inventory
              </Link>
            </div>
            {low.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                Nothing is below its minimum.
              </p>
            ) : (
              <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                {low.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 bg-surface px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {item.name}
                      <span className="ml-2 text-xs text-muted">{item.category}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-warn">
                      {item.qty} / {item.min} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid content-start gap-2">
            <h2 className="text-sm font-medium">Categories</h2>
            {inv.categories.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-xs text-muted">
                No categories yet. Add one in Inventory.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                {inv.categories.map((category) => {
                  const runningLow = category.items.filter(isLow).length;
                  return (
                    <li key={category.id} className="bg-surface px-3 py-3">
                      <p className="truncate text-sm">{category.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {category.items.length} items
                        {runningLow > 0 && <span className="text-warn"> · {runningLow} low</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </PageGrid>
  );
}
