"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { itemReport, type Line } from "@/lib/analytics";
import type { Item } from "@/lib/inventory";
import { inr, pct } from "@/lib/money";
import { ItemPriceLine } from "./analytics/charts";

/**
 * Everything recorded about one item, from the first bill that mentioned it.
 * A native <dialog>, so Escape, focus trapping and the backdrop come free.
 */
export function ItemHistory({
  item,
  category,
  lines,
  loading,
  onClose,
}: {
  item: Item;
  category: string;
  lines: Line[];
  loading: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);

  const report = itemReport(lines, { id: item.id, name: item.name });

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`Purchase history for ${item.name}`}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{item.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {category}
            {item.room && ` · ${item.room}`} · {item.qty} {item.unit} in stock, minimum {item.min}
            {report && ` · priced per ${report.base}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-bg hover:text-fg"
        >
          <X size={16} />
        </button>
      </header>

      <div className="grid gap-5 px-5 py-5">
        {loading && !report && <p className="py-8 text-center text-sm text-muted">Loading purchase history…</p>}

        {!loading && !report && (
          <p className="py-8 text-center text-sm text-muted">
            No purchases recorded yet. This fills in from the first bill that includes {item.name}.
          </p>
        )}

        {report && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Stat label="Bought" value={`${report.purchases.length}×`} hint={`since ${report.firstDate}`} />
              <Stat
                label="Last bought"
                value={report.daysSince === 0 ? "today" : `${report.daysSince}d ago`}
                hint={report.lastDate}
              />
              <Stat
                label="Usually every"
                value={report.cadenceDays ? `${report.cadenceDays}d` : "—"}
                hint={report.nextDue ? `next due ${report.nextDue}` : "needs a second purchase"}
              />
              <Stat label="Spent on it" value={inr(report.spend)} hint={`${report.quantity} ${report.base} in total`} />
            </dl>

            <section className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">Price per {report.base}</h3>
                <p className="text-xs text-muted">
                  now <span className="font-mono text-fg">{inr(report.latest, 2)}</span> · best{" "}
                  <span className="font-mono text-accent">{inr(report.best, 2)}</span> · average{" "}
                  <span className="font-mono">{inr(report.avg, 2)}</span>
                  {report.pct !== null && (
                    <span className={report.pct > 0 ? "ml-2 text-warn" : "ml-2 text-accent"}>
                      {pct(report.pct)} since the first buy
                      {report.annualisedPct !== null && ` · ${pct(report.annualisedPct)}/yr`}
                    </span>
                  )}
                </p>
              </div>
              {report.purchases.length >= 2 ? (
                <ItemPriceLine purchases={report.purchases} base={report.base} avg={report.avg} />
              ) : (
                <p className="rounded-xl border border-border bg-bg px-4 py-6 text-center text-sm text-muted">
                  One purchase so far — a second one starts the price line.
                </p>
              )}
              <p className="text-[11px] text-muted">The dashed line is the average paid across every purchase.</p>
            </section>

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Every purchase</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="pb-2 font-normal">Date</th>
                      <th className="pb-2 font-normal">Shop</th>
                      <th className="pb-2 text-right font-normal">Bought</th>
                      <th className="pb-2 text-right font-normal">Paid</th>
                      <th className="pb-2 text-right font-normal">Per {report.base}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...report.purchases].reverse().map((p, i) => (
                      <tr key={`${p.date}-${p.store}-${i}`}>
                        <td className="py-1.5">{p.date}</td>
                        <td className="py-1.5">{p.store}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {p.qty} {p.unit}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{inr(p.cost, 2)}</td>
                        <td
                          className={`py-1.5 text-right font-mono tabular-nums ${
                            p.unitPrice === report.best ? "text-accent" : ""
                          }`}
                        >
                          {inr(p.unitPrice, 2)}
                          {p.unitPrice === report.best && <span className="ml-1 text-[10px]">best</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.otherBases > 0 && (
                <p className="text-[11px] text-muted">
                  {report.otherBases} more purchase{report.otherBases > 1 ? "s" : ""} left out: bought in a unit that
                  doesn&rsquo;t convert to {report.base}.
                </p>
              )}
            </section>

            {report.byStore.length > 1 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-medium">By shop, cheapest first</h3>
                <ul className="divide-y divide-border text-xs">
                  {report.byStore.map((s) => (
                    <li key={s.name} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span>
                        {s.name}
                        <span className="ml-2 text-muted">
                          {s.purchases} buy{s.purchases > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {inr(s.avg, 2)} avg
                        <span className="ml-2 text-muted">best {inr(s.best, 2)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dd className="text-xl font-semibold">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
