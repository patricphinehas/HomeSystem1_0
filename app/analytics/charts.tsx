"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Deviation, ItemPurchase, MonthSpend } from "@/lib/analytics";
import { inr, inrShort, pct } from "@/lib/money";
import { MONTH_LABEL, usePalette, type Palette } from "./palette";

/* ---------- shared chrome ---------- */

const axisTick = (p: Palette) => ({ fill: p.ink, fontSize: 11 });

const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** A domain and tick list on round numbers, so an axis never reads 182 / 189 / 196. */
function niceAxis(values: number[], divisions = 3) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = NICE.find((n) => n >= Math.max(max - min, 1) / divisions) ?? 10000;
  const lo = Math.floor((min - step / 2) / step) * step;
  const hi = Math.ceil((max + step / 2) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [lo, hi] as [number, number], ticks };
}

function Tip({ title, rows, p }: { title: string; rows: { key?: string; label: string; value: string }[]; p: Palette }) {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-sm"
      style={{ borderColor: p.grid }}
    >
      <p className="mb-1 text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2">
          {r.key && <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: r.key }} />}
          <span className="font-mono text-sm tabular-nums text-fg">{r.value}</span>
          <span className="text-muted">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

/** Legend and table twin. Every chart here has both, so no value is colour-only. */
function Frame({
  legend,
  table,
  children,
}: {
  legend: { color: string; label: string; value?: string }[];
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="grid gap-3">
      {showTable ? <div className="max-w-full overflow-x-auto">{table}</div> : children}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="text-muted">{l.label}</span>
              {l.value && <span className="font-mono tabular-nums text-fg">{l.value}</span>}
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
          className="shrink-0 text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
    </div>
  );
}

const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <table className="w-full text-left text-xs">
    <thead>
      <tr className="text-muted">
        {head.map((h, i) => (
          <th key={h} className={`pb-2 font-normal ${i > 0 ? "text-right" : ""}`}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      {rows.map((row) => (
        <tr key={String(row[0])}>
          {row.map((cell, i) => (
            <td key={i} className={`py-1.5 ${i > 0 ? "text-right font-mono tabular-nums" : ""}`}>
              {cell}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

/* ---------- 1. spend over time, with the projection ---------- */

export function SpendTrend({
  monthly,
  projection,
  height = 260,
}: {
  monthly: MonthSpend[];
  projection: MonthSpend[];
  height?: number;
}) {
  const p = usePalette();
  const last = monthly[monthly.length - 1];

  const data = [
    ...monthly.map((m, i) => ({
      month: m.month,
      spend: m.spend,
      // The projection starts at the last real point so the two lines join up.
      projected: i === monthly.length - 1 ? m.spend : null,
    })),
    ...projection.map((m) => ({ month: m.month, spend: null, projected: m.spend })),
  ];

  return (
    <Frame
      legend={[
        { color: p.series[0], label: "Spent", value: inr(last?.spend ?? 0) },
        { color: p.series[1], label: "Projected", value: inr(projection[0]?.spend ?? 0) },
      ]}
      table={
        <Table
          head={["Month", "Spent", "Projected"]}
          rows={data.map((d) => [MONTH_LABEL(d.month), d.spend === null ? "—" : inr(d.spend), d.projected === null ? "—" : inr(d.projected)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={MONTH_LABEL} tick={axisTick(p)} tickLine={false} axisLine={{ stroke: p.axis }} />
          <YAxis tickFormatter={inrShort} tick={axisTick(p)} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            cursor={{ stroke: p.axis, strokeWidth: 1 }}
            content={({ active, label, payload }) =>
              active && payload?.length ? (
                <Tip
                  p={p}
                  title={MONTH_LABEL(String(label))}
                  rows={payload
                    .filter((s) => s.value !== null && s.value !== undefined)
                    .map((s) => ({
                      key: String(s.stroke),
                      label: s.dataKey === "spend" ? "spent" : "projected",
                      value: inr(Number(s.value), 2),
                    }))}
                />
              ) : null
            }
          />
          <Line
            dataKey="spend"
            name="Spent"
            stroke={p.series[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: p.surface }}
          />
          <Line
            dataKey="projected"
            name="Projected"
            stroke={p.series[1]}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, stroke: p.surface, fill: p.series[1] }}
            activeDot={{ r: 4, strokeWidth: 2, stroke: p.surface }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/* ---------- 2. where the money goes ---------- */

export function SpendBreakdown({
  slices,
  dimension,
  height = 260,
}: {
  slices: { name: string; spend: number }[];
  dimension: string;
  height?: number;
}) {
  const p = usePalette();
  const total = slices.reduce((t, s) => t + s.spend, 0);

  // Five named slices plus a folded tail: past six segments a pie stops being readable.
  const top = slices.slice(0, 5);
  const tail = slices.slice(5);
  const data = [
    ...top,
    ...(tail.length ? [{ name: `Other (${tail.length})`, spend: tail.reduce((t, s) => t + s.spend, 0) }] : []),
  ];
  const colorAt = (i: number) => (i < top.length ? p.series[i] : p.other);

  if (total === 0) return <p className="py-10 text-center text-sm text-muted">No spend in this range.</p>;

  return (
    <Frame
      legend={data.map((s, i) => ({
        color: colorAt(i),
        label: s.name,
        value: `${inr(s.spend)} · ${Math.round((s.spend / total) * 100)}%`,
      }))}
      table={
        <Table
          head={[dimension, "Spend", "Share"]}
          rows={slices.map((s) => [s.name, inr(s.spend, 2), `${((s.spend / total) * 100).toFixed(1)}%`])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="spend"
            nameKey="name"
            innerRadius="45%"
            outerRadius="78%"
            paddingAngle={2}
            stroke={p.surface}
            strokeWidth={2}
            isAnimationActive={false}
            label={({ percent, x, y }) =>
              // Labels sit outside the ring, so they wear the text token, not the
              // fill. Only slices with room get one; the legend carries the rest.
              (percent ?? 0) >= 0.08 ? (
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={p.strong}>
                  {Math.round((percent ?? 0) * 100)}%
                </text>
              ) : (
                <g />
              )
            }
            labelLine={false}
          >
            {data.map((s, i) => (
              <Cell key={s.name} fill={colorAt(i)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip
                  p={p}
                  title={String(payload[0].name)}
                  rows={[
                    { label: "spent", value: inr(Number(payload[0].value), 2) },
                    { label: "of total", value: `${((Number(payload[0].value) / total) * 100).toFixed(1)}%` },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/* ---------- 3. the basket price index ---------- */

export function PriceIndexChart({
  index,
  height = 240,
}: {
  index: { month: string; index: number; items: number }[];
  height?: number;
}) {
  const p = usePalette();
  const latest = index[index.length - 1];

  return (
    <Frame
      legend={[{ color: p.series[0], label: `Basket of ${latest?.items ?? 0} repeat items`, value: String(latest?.index ?? 100) }]}
      table={<Table head={["Month", "Index", "vs start"]} rows={index.map((r) => [MONTH_LABEL(r.month), r.index, pct(r.index - 100)])} />}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={index} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={MONTH_LABEL} tick={axisTick(p)} tickLine={false} axisLine={{ stroke: p.axis }} />
          <YAxis
            tick={axisTick(p)}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            domain={[(min: number) => Math.floor(min) - 1, (max: number) => Math.ceil(max) + 1]}
          />
          <ReferenceLine y={100} stroke={p.axis} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: p.axis, strokeWidth: 1 }}
            content={({ active, label, payload }) =>
              active && payload?.length ? (
                <Tip
                  p={p}
                  title={MONTH_LABEL(String(label))}
                  rows={[
                    { key: p.series[0], label: "index (start = 100)", value: String(payload[0].value) },
                    { label: "since the start", value: pct(Number(payload[0].value) - 100) },
                  ]}
                />
              ) : null
            }
          />
          <Line
            dataKey="index"
            name="Price index"
            stroke={p.series[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: p.surface }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/* ---------- 4. per-purchase deviation ---------- */

/** A 24px transparent hit area around each small mark, so the dot is catchable. */
const hitShape =
  (fill: string, kind: "circle" | "triangle") =>
  ({ cx, cy, size }: { cx?: number; cy?: number; size?: number }) => {
    if (cx === undefined || cy === undefined) return <g />;
    const r = Math.max(4, Math.sqrt((size ?? 64) / Math.PI));
    return (
      <g>
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        {kind === "circle" ? (
          <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.85} />
        ) : (
          <polygon
            points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r * 0.9} ${cx - r * 1.1},${cy + r * 0.9}`}
            fill={fill}
            fillOpacity={0.85}
          />
        )}
      </g>
    );
  };

export function DeviationScatter({ deviations, height = 260 }: { deviations: Deviation[]; height?: number }) {
  const p = usePalette();
  const points = deviations.map((d) => ({ ...d, t: Date.parse(d.date) }));
  const over = points.filter((d) => d.pct > 0);
  const under = points.filter((d) => d.pct <= 0);

  if (points.length === 0)
    return (
      <p className="py-10 text-center text-sm text-muted">
        Nothing to compare yet — an item needs a second purchase before its price can deviate.
      </p>
    );

  return (
    <Frame
      legend={[
        { color: p.critical, label: `Paid above its usual price (${over.length})` },
        { color: p.good, label: `Paid at or below (${under.length})` },
      ]}
      table={
        <Table
          head={["Item", "Date", "Expected", "Paid", "Off by"]}
          rows={[...points]
            .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
            .slice(0, 25)
            .map((d) => [d.name, d.date, `${inr(d.expected, 2)}/${d.base}`, `${inr(d.actual, 2)}/${d.base}`, pct(d.pct)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis
            type="number"
            dataKey="t"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => new Date(t).toLocaleString("en-IN", { month: "short" })}
            tick={axisTick(p)}
            tickLine={false}
            axisLine={{ stroke: p.axis }}
          />
          <YAxis
            type="number"
            dataKey="pct"
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
            tick={axisTick(p)}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          {/* Bubble area carries the money at stake, so a 5% miss on rice outweighs 40% on glue. */}
          <ZAxis type="number" dataKey="cost" range={[60, 460]} />
          <ReferenceLine y={0} stroke={p.axis} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as (Deviation & { t: number }) | undefined;
              return active && d ? (
                <Tip
                  p={p}
                  title={`${d.name} · ${d.date}`}
                  rows={[
                    { key: d.pct > 0 ? p.critical : p.good, label: `off its usual ${inr(d.expected, 2)}/${d.base}`, value: pct(d.pct) },
                    { label: `paid per ${d.base}`, value: inr(d.actual, 2) },
                    { label: "line cost", value: inr(d.cost, 2) },
                  ]}
                />
              ) : null;
            }}
          />
          <Scatter name="Paid more" data={over} shape={hitShape(p.critical, "triangle")} isAnimationActive={false} />
          <Scatter name="Paid at or below" data={under} shape={hitShape(p.good, "circle")} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/* ---------- 5. one item's price, purchase by purchase ---------- */

/**
 * Unit price over time for a single item. One series, so no legend box — the
 * card title names it. Rendered without the table twin because the drawer that
 * uses it already lists every purchase underneath.
 */
export function ItemPriceLine({ purchases, base, avg }: { purchases: ItemPurchase[]; base: string; avg: number }) {
  const p = usePalette();
  const data = purchases.map((q) => ({ ...q, t: Date.parse(q.date) }));
  const day = (t: number) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short" });
  const y = niceAxis(purchases.map((q) => q.unitPrice));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={day}
          tick={axisTick(p)}
          tickLine={false}
          axisLine={{ stroke: p.axis }}
        />
        <YAxis
          tickFormatter={inrShort}
          tick={axisTick(p)}
          tickLine={false}
          axisLine={false}
          width={56}
          domain={y.domain}
          ticks={y.ticks}
        />
        <ReferenceLine y={avg} stroke={p.axis} strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: p.axis, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const q = payload?.[0]?.payload as (ItemPurchase & { t: number }) | undefined;
            return active && q ? (
              <Tip
                p={p}
                title={`${q.date} · ${q.store}`}
                rows={[
                  { key: p.series[0], label: `per ${base}`, value: inr(q.unitPrice, 2) },
                  { label: `for ${q.qty} ${q.unit}`, value: inr(q.cost, 2) },
                ]}
              />
            ) : null;
          }}
        />
        <Line
          dataKey="unitPrice"
          stroke={p.series[0]}
          strokeWidth={2}
          dot={{ r: 3.5, strokeWidth: 2, stroke: p.surface, fill: p.series[0] }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: p.surface }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
