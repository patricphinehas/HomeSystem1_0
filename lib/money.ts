/**
 * Money and percentage formatting, shared by the pages and the charts.
 *
 * The locale and currency come from `lib/region.ts`, which settings fills in.
 * The formatters are rebuilt whenever that changes rather than on every call,
 * because `new Intl.NumberFormat` is the expensive part and these run inside
 * table rows and chart ticks.
 */

import { currencySymbol, region, type Region } from "./region.ts";

const build = ({ locale, currency }: Region) => ({
  whole: new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  fraction: new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  symbol: currencySymbol(locale, currency),
  /** Lakh and crore are how Indian rupees are read; everywhere else it is k/M. */
  indian: currency === "INR",
});

let applied = region();
let formats = build(applied);

const current = () => {
  const now = region();
  if (now !== applied) {
    applied = now;
    formats = build(now);
  }
  return formats;
};

export const inr = (n: number | null | undefined, dp: 0 | 2 = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : (dp === 0 ? current().whole : current().fraction).format(n);

/** Compact axis label: ₹1.2k, ₹14k, ₹1.1L — or $1.2k, $1.4M off the subcontinent. */
export const inrShort = (n: number) => {
  const { symbol, indian } = current();
  const abs = Math.abs(n);
  if (indian) {
    if (abs >= 1e5) return `${symbol}${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  } else if (abs >= 1e6) {
    return `${symbol}${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  }
  if (abs >= 1e3) return `${symbol}${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return `${symbol}${Math.round(n)}`;
};

export const pct = (n: number | null | undefined, dp = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;

export const perUnit = (price: number, base: string) => `${current().fraction.format(price)}/${base}`;
