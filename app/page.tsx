"use client";

import Link from "next/link";
import { lowStock, totals } from "@/lib/inventory";
import { useInventory } from "./use-inventory";
import { Notice, Skeleton } from "./ui";

export default function Overview() {
  const { inv, error } = useInventory();

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">What the house has, and what it is about to run out of.</p>
      </header>

      {error && <Notice>{error}</Notice>}
      {!inv && !error && <Skeleton rows={2} />}

      {inv && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {Object.entries(totals(inv)).map(([key, value]) => (
              <div key={key} className="bg-surface px-4 py-5">
                <dd className="font-mono text-2xl tabular-nums">{value}</dd>
                <dt className="mt-1 text-xs text-muted capitalize">
                  {{ categories: "categories", items: "items tracked", low: "running low", out: "out of stock" }[key]}
                </dt>
              </div>
            ))}
          </dl>

          <section className="grid gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Buy next</h2>
              <Link href="/inventory" className="text-sm text-accent hover:underline">
                Open inventory
              </Link>
            </div>
            {lowStock(inv).length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">
                Nothing is below its minimum. Add thresholds in the Inventory tabs to get warned earlier.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {lowStock(inv)
                  .slice(0, 6)
                  .map((item) => (
                    <li key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        {item.name}
                        <span className="ml-2 text-xs text-muted">{item.category}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-warn">
                        {item.qty} / {item.min} {item.unit}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
