"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { analyse, groupSpend, monthOf, type Analytics } from "@/lib/analytics";
import { tagIndex } from "@/lib/inventory";
import { inr, pct } from "@/lib/money";
import { useInventory } from "../use-inventory";
import { useJson } from "../use-api";
import { Card, Notice, Skeleton } from "../ui";
import { PageGrid, PageHeader } from "../page-frame";
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

type RangeFilter =
  | { kind: "preset"; id: string }
  | { kind: "month"; value: string }
  | { kind: "year"; value: string };

function filterLines(lines: Analytics["lines"], filter: RangeFilter) {
  if (filter.kind === "month") return lines.filter((l) => monthOf(l.date) === filter.value);
  if (filter.kind === "year") return lines.filter((l) => l.date.startsWith(`${filter.value}-`));
  const months = RANGES.find((r) => r.id === filter.id)?.months ?? 0;
  const from = cutoff(months);
  return lines.filter((l) => l.date >= from);
}

export default function AnalyticsPage() {
  const { data, error } = useJson<Analytics>("/api/analytics");
  const { inv } = useInventory();
  const [filter, setFilter] = useState<RangeFilter>({ kind: "preset", id: "all" });
  const [dimension, setDimension] = useState<"category" | "tag">("category");

  const years = useMemo(() => {
    if (!data?.lines.length) return [];
    return [...new Set(data.lines.map((l) => l.date.slice(0, 4)))].sort().reverse();
  }, [data]);

  // The route hands over the purchase lines, so every stat on this page is
  // recomputed from the same filtered set - the numbers can't disagree.
  const report = useMemo(() => {
    if (!data) return null;
    return analyse(filterLines(data.lines, filter));
  }, [data, filter]);

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
  const slices = dimension === "tag" ? byTag : byCategory;
  const chartHeight = 168;

  return (
    <PageGrid>
      <PageHeader
        title="Analytics"
        hint={
          empty
            ? "Nothing in this range."
            : `${totals.bills} bills · ${totals.lines} purchases · ${totals.from} to ${totals.to}`
        }
      />

      <AnalyticsFilters
        filter={filter}
        years={years}
        dimension={dimension}
        onFilter={setFilter}
        onDimension={setDimension}
      />

      {empty && (
        <p className="text-xs text-muted lg:col-span-full">
          Price history starts with the first bill.{" "}
          <Link href="/upload" className="text-accent hover:underline">
            Enter a bill
          </Link>
          , or load demo bills with <code>mise run seed</code>.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:col-span-full">
        <Tile label="Spent in range" value={inr(totals.spend)} hint={`${inr(totals.perBill)} per bill`} />
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

      <Card dense title="Spend over time" subtitle="Monthly totals, next three months from the trend.">
        {monthly.length === 0 ? (
          <EmptyCell>No spend in this range.</EmptyCell>
        ) : (
          <SpendTrend monthly={monthly} projection={projection} height={chartHeight} />
        )}
      </Card>

      <Card
        dense
        title={`Where the money goes, by ${dimension}`}
        subtitle={
          dimension === "tag"
            ? "An item can carry several tags, so shares can overlap."
            : "The inventory category each purchase was matched to."
        }
      >
        {slices.length === 0 ? (
          <EmptyCell>No purchases to group.</EmptyCell>
        ) : (
          <SpendBreakdown slices={slices} dimension={dimension} height={chartHeight} />
        )}
      </Card>

      <Card
        dense
        title="Price index"
        subtitle={
          index.length >= 2
            ? `First month = 100. Now ${index[index.length - 1].index} (${pct(inflation.basketPct)}).`
            : "Needs an item bought in two different months."
        }
      >
        {index.length >= 2 ? (
          <PriceIndexChart index={index} height={chartHeight} />
        ) : (
          <EmptyCell>Not enough repeat purchases yet.</EmptyCell>
        )}
      </Card>

      <Card dense title="Deviation per purchase" subtitle="Each repeat buy against that item's running price.">
        <DeviationScatter deviations={deviations} height={chartHeight} />
      </Card>

      <div className="lg:col-span-full">
      <Card
        dense
        title="Biggest price moves"
        subtitle={`First price to latest. Plain average ${pct(inflation.avgPct)}, spend-weighted ${pct(inflation.weightedPct)}.`}
      >
        {inflation.perItem.length === 0 ? (
          <EmptyCell>No item has been bought twice yet.</EmptyCell>
        ) : (
          <div className="max-w-full overflow-x-auto">
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
                  .slice(0, 8)
                  .map((item) => (
                    <tr key={item.key}>
                      <td className="py-1.5">
                        {item.name}
                        <span className="ml-2 text-xs text-muted">
                          {item.points} buys · per {item.base}
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums">{inr(item.first, 2)}</td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums">{inr(item.latest, 2)}</td>
                      <td className="py-1.5 text-right font-mono text-xs tabular-nums text-muted">{inr(item.best, 2)}</td>
                      <td
                        className={`py-1.5 text-right font-mono text-xs tabular-nums ${
                          item.pct > 0 ? "text-warn" : item.pct < 0 ? "text-accent" : "text-muted"
                        }`}
                      >
                        {pct(item.pct)}
                      </td>
                      <td className="hidden py-1.5 text-right font-mono text-xs tabular-nums text-muted sm:table-cell">
                        {pct(item.annualisedPct)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
    </PageGrid>
  );
}

/** Date range and breakdown. Stays on screen when the current range has no bills. */
export function AnalyticsFilters({
  filter,
  years,
  dimension,
  onFilter,
  onDimension,
}: {
  filter: RangeFilter;
  years: string[];
  dimension: "category" | "tag";
  onFilter: (next: RangeFilter) => void;
  onDimension: (next: "category" | "tag") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border pb-3 lg:col-span-full">
      <div role="group" aria-label="Date range" className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={filter.kind === "preset" && filter.id === r.id}
            onClick={() => onFilter({ kind: "preset", id: r.id })}
            className={`rounded-lg px-2.5 py-1 text-xs transition active:scale-[0.98] ${
              filter.kind === "preset" && filter.id === r.id
                ? "bg-accent-soft font-medium text-accent"
                : "border border-border bg-surface text-muted hover:text-fg"
            }`}
          >
            {r.label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Month
          <input
            type="month"
            value={filter.kind === "month" ? filter.value : ""}
            onChange={(e) => {
              const value = e.target.value;
              if (value) onFilter({ kind: "month", value });
            }}
            className={`rounded-lg border bg-surface px-2 py-1 text-xs text-fg ${
              filter.kind === "month" ? "border-accent" : "border-border"
            }`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Year
          <select
            value={filter.kind === "year" ? filter.value : ""}
            onChange={(e) => {
              const value = e.target.value;
              if (value) onFilter({ kind: "year", value });
            }}
            className={`rounded-lg border bg-surface px-2 py-1 text-xs text-fg ${
              filter.kind === "year" ? "border-accent" : "border-border"
            }`}
          >
            <option value="">—</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div role="group" aria-label="Group spend by" className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        Break down by
        {(["category", "tag"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={dimension === d}
            onClick={() => onDimension(d)}
            className={`rounded-lg px-2 py-1 text-xs transition ${
              dimension === d ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyCell({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-xs text-muted">{children}</p>;
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "accent";
}) {
  return (
    <div className="bg-surface px-3 py-3">
      <dd
        className={`text-xl font-semibold tabular-nums ${
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
