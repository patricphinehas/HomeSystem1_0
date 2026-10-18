"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { analyse, groupSpend, type Analytics } from "@/lib/analytics";
import { tagIndex } from "@/lib/inventory";
import { inr, pct } from "@/lib/money";
import { useInventory } from "../use-inventory";
import { useJson } from "../use-api";
import { Card, Notice, Skeleton } from "../ui";
import { DeviationScatter, PriceIndexChart, SpendBreakdown, SpendTrend } from "./charts";

const RANGES = [
  { id: "all", label: "All time", months: 0 },
  { id: "12m", label: "Last 12 months", months: 12 },
  { id: "6m", label: "Last 6 months", months: 6 },
  { id: "3m", label: "Last 3 months", months: 3 },
];

const cutoff = (months: number) => {
  if (months === 0) return "";
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};

export default function AnalyticsPage() {
  const { data, error } = useJson<Analytics>("/api/analytics");
  const { inv } = useInventory();
  const [range, setRange] = useState("all");
  const [dimension, setDimension] = useState<"category" | "tag">("category");

  const months = RANGES.find((r) => r.id === range)!.months;

  // The route hands over the purchase lines, so every stat on this page is
  // recomputed from the same filtered set - the numbers can't disagree.
  const report = useMemo(() => {
    if (!data) return null;
    const from = cutoff(months);
    return analyse(data.lines.filter((l) => l.date >= from));
  }, [data, months]);

  // Tags live in the inventory file, not in the bills, so grouping by tag is a
  // join done here: current tags, not whatever was true at purchase time.
  const byTag = useMemo(() => {
    if (!report || !inv) return [];
    const tags = tagIndex(inv);
    const lines = report.lines.flatMap((l) => {
      const on = (l.itemId && tags.get(l.itemId)) || [];
      return on.length ? on.map((tag) => ({ ...l, tag })) : [{ ...l, tag: "untagged" }];
    });
    return groupSpend(lines, (l) => l.tag);
  }, [report, inv]);

  if (error) return <Notice>{error}</Notice>;
  if (!report) return <Skeleton rows={4} />;

  const { totals, monthly, projection, deviation, index, inflation, byCategory, deviations } = report;
  const empty = totals.lines === 0;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          {empty
            ? "Nothing to analyse yet."
            : `${totals.bills} bills · ${totals.lines} purchases · ${totals.from} to ${totals.to}`}
        </p>
      </header>

      {empty ? (
        <Card title="No bills in this range" subtitle="Price history starts with the first bill you enter.">
          <Link href="/upload" className="text-sm text-accent hover:underline">
            Enter a bill
          </Link>
          <p className="mt-3 text-xs text-muted">
            Or load eight months of demo bills to see the charts working: <code>mise run seed</code>.
          </p>
        </Card>
      ) : (
        <>
          {/* One filter row, scoping everything below it. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4">
            <div role="group" aria-label="Date range" className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={range === r.id}
                  onClick={() => setRange(r.id)}
                  className={`rounded-xl px-3 py-1.5 text-sm transition active:scale-[0.98] ${
                    range === r.id
                      ? "bg-accent-soft font-medium text-accent"
                      : "border border-border bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Group spend by" className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              Break down by
              {(["category", "tag"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={dimension === d}
                  onClick={() => setDimension(d)}
                  className={`rounded-lg px-2 py-1 text-sm transition ${
                    dimension === d ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            <Tile label="Spent in range" value={inr(totals.spend)} hint={`${inr(totals.perBill)} per bill`} hero />
            <Tile
              label="Projected next month"
              value={inr(projection[0]?.spend ?? 0)}
              hint={totals.months >= 3 ? `trend of ${totals.months} months` : "average so far"}
            />
            <Tile
              label="Basket inflation"
              value={pct(inflation.weightedPct)}
              hint={`spend-weighted, ${inflation.items} repeat items`}
              tone={(inflation.weightedPct ?? 0) > 0 ? "warn" : "accent"}
            />
            <Tile
              label={deviation ? `${deviation.month} vs expected` : "Deviation"}
              value={deviation ? inr(deviation.diff) : "—"}
              hint={deviation ? `expected ${inr(deviation.expected)}, spent ${inr(deviation.actual)}` : "needs two months"}
              tone={(deviation?.diff ?? 0) > 0 ? "warn" : "accent"}
            />
          </dl>

          <Card
            title="Spend over time"
            subtitle="Monthly totals, with the next three months extended from the trend."
          >
            <SpendTrend monthly={monthly} projection={projection} />
          </Card>

          <Card
            title={`Where the money goes, by ${dimension}`}
            subtitle={
              dimension === "tag"
                ? "Tagged in the inventory. An item can carry several tags, so shares can overlap."
                : "The inventory category each purchase was matched to."
            }
          >
            <SpendBreakdown slices={dimension === "tag" ? byTag : byCategory} dimension={dimension} />
          </Card>

          <Card
            title="Price index"
            subtitle={
              index.length >= 2
                ? `Spend-weighted basket of repeat purchases, first month = 100. Now ${index[index.length - 1].index} (${pct(inflation.basketPct)}).`
                : "Needs an item bought in two different months."
            }
          >
            {index.length >= 2 ? (
              <PriceIndexChart index={index} />
            ) : (
              <p className="py-10 text-center text-sm text-muted">Not enough repeat purchases yet.</p>
            )}
          </Card>

          <Card
            title="Deviation per purchase"
            subtitle="Each repeat purchase against that item's own running price. Bubble size is the money on the line."
          >
            <DeviationScatter deviations={deviations} />
          </Card>

          <Card
            title="Biggest price moves"
            subtitle={`First recorded price to latest. Plain average ${pct(inflation.avgPct)}, spend-weighted ${pct(inflation.weightedPct)}.`}
          >
            {inflation.perItem.length === 0 ? (
              <p className="text-sm text-muted">No item has been bought twice yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="pb-2 font-normal">Item</th>
                      <th className="pb-2 text-right font-normal">First</th>
                      <th className="pb-2 text-right font-normal">Latest</th>
                      <th className="pb-2 text-right font-normal">Best</th>
                      <th className="pb-2 text-right font-normal">Change</th>
                      <th className="hidden pb-2 text-right font-normal sm:table-cell">Per year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...inflation.perItem]
                      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                      .slice(0, 12)
                      .map((item) => (
                        <tr key={item.key}>
                          <td className="py-2">
                            {item.name}
                            <span className="ml-2 text-xs text-muted">
                              {item.points} buys · per {item.base}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums">{inr(item.first, 2)}</td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums">{inr(item.latest, 2)}</td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums text-muted">{inr(item.best, 2)}</td>
                          <td
                            className={`py-2 text-right font-mono text-xs tabular-nums ${
                              item.pct > 0 ? "text-warn" : item.pct < 0 ? "text-accent" : "text-muted"
                            }`}
                          >
                            {pct(item.pct)}
                          </td>
                          <td className="hidden py-2 text-right font-mono text-xs tabular-nums text-muted sm:table-cell">
                            {pct(item.annualisedPct)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
  hero,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "accent";
  hero?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-5">
      <dd
        className={`font-semibold ${hero ? "text-3xl md:text-5xl" : "text-2xl"} ${
          tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent" : ""
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1 text-xs text-muted">{label}</dt>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
