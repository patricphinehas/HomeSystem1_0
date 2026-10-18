/**
 * Spend and inflation maths. Pure functions over flattened bill lines, so the
 * Express route stays a thin wrapper and all of this is testable with node:test.
 */

export type Line = {
  billId: string;
  /** ISO date, yyyy-mm-dd. */
  date: string;
  store: string;
  name: string;
  /** Lowercased, trimmed name - the key prices are tracked under. */
  key: string;
  itemId: string | null;
  category: string | null;
  qty: number;
  unit: string;
  cost: number;
  base: string;
  baseQty: number;
  unitPrice: number;
};

export const monthOf = (date: string) => date.slice(0, 7);

export const itemKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const mean = (ns: number[]) => (ns.length ? sum(ns) / ns.length : 0);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Every month from `from` to `to` inclusive, so a quiet month reads as zero spend. */
export const monthRange = (from: string, to: string) => {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

export type MonthSpend = { month: string; spend: number };

export const spendByMonth = (lines: Line[]): MonthSpend[] => {
  if (lines.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const l of lines) {
    const m = monthOf(l.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + l.cost);
  }
  const months = [...byMonth.keys()].sort();
  return monthRange(months[0], months[months.length - 1]).map((month) => ({
    month,
    spend: round(byMonth.get(month) ?? 0),
  }));
};

/**
 * Least-squares trend over the monthly series, extended `ahead` months. Falls
 * back to the mean while there are fewer than three months to fit, and never
 * projects a negative spend.
 */
export const projectSpend = (series: MonthSpend[], ahead = 3): MonthSpend[] => {
  if (series.length === 0) return [];
  const n = series.length;
  let slope = 0;
  let intercept = mean(series.map((s) => s.spend));
  if (n >= 3) {
    const xs = series.map((_, i) => i);
    const ys = series.map((s) => s.spend);
    const mx = mean(xs);
    const my = mean(ys);
    const denom = sum(xs.map((x) => (x - mx) ** 2));
    slope = denom === 0 ? 0 : sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / denom;
    intercept = my - slope * mx;
  }
  const out: MonthSpend[] = [];
  let month = series[n - 1].month;
  for (let i = 1; i <= ahead; i++) {
    month = nextMonth(month);
    out.push({ month, spend: round(Math.max(0, intercept + slope * (n - 1 + i))) });
  }
  return out;
};

/** What the previous three months said the latest month would cost, against what it did. */
export const monthDeviation = (series: MonthSpend[]) => {
  if (series.length < 2) return null;
  const actual = series[series.length - 1];
  const prior = series.slice(Math.max(0, series.length - 4), series.length - 1);
  const expected = round(mean(prior.map((s) => s.spend)));
  return {
    month: actual.month,
    expected,
    actual: actual.spend,
    diff: round(actual.spend - expected),
    pct: expected > 0 ? round(((actual.spend - expected) / expected) * 100, 1) : null,
  };
};

export type PricePoint = { date: string; month: string; unitPrice: number; cost: number };
export type History = { key: string; name: string; base: string; spend: number; points: PricePoint[] };

/**
 * Price points per item, oldest first. An item bought in two different bases
 * (by weight once, by piece the next time) keeps only the base it was mostly
 * bought in, because the two prices do not compare.
 */
export const priceHistory = (lines: Line[]): History[] => {
  const groups = new Map<string, Line[]>();
  for (const l of lines) groups.set(l.key, [...(groups.get(l.key) ?? []), l]);

  return [...groups.entries()]
    .map(([key, ls]) => {
      // Most *purchases* win, not most money: one bulk sack bought "by the pack"
      // should not redefine the base for an item normally bought by weight.
      const byBase = new Map<string, { count: number; spend: number }>();
      for (const l of ls) {
        const seen = byBase.get(l.base) ?? { count: 0, spend: 0 };
        byBase.set(l.base, { count: seen.count + 1, spend: seen.spend + l.cost });
      }
      const base = [...byBase.entries()].sort(
        (a, b) => b[1].count - a[1].count || b[1].spend - a[1].spend,
      )[0][0];
      const kept = ls.filter((l) => l.base === base).sort((a, b) => a.date.localeCompare(b.date));
      return {
        key,
        name: kept[kept.length - 1].name,
        base,
        spend: round(sum(kept.map((l) => l.cost))),
        points: kept.map((l) => ({
          date: l.date,
          month: monthOf(l.date),
          unitPrice: round(l.unitPrice, 4),
          cost: round(l.cost),
        })),
      };
    })
    .sort((a, b) => b.spend - a.spend);
};

export type ItemInflation = {
  key: string;
  name: string;
  base: string;
  first: number;
  latest: number;
  best: number;
  pct: number;
  annualisedPct: number | null;
  spanDays: number;
  points: number;
  spend: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Per-item price change, first recorded price to latest. Needs two price points. */
export const itemInflation = (history: History[]): ItemInflation[] =>
  history
    .filter((h) => h.points.length >= 2 && h.points[0].unitPrice > 0)
    .map((h) => {
      const first = h.points[0];
      const latest = h.points[h.points.length - 1];
      const spanDays = daysBetween(first.date, latest.date);
      const ratio = latest.unitPrice / first.unitPrice;
      return {
        key: h.key,
        name: h.name,
        base: h.base,
        first: first.unitPrice,
        latest: latest.unitPrice,
        best: Math.min(...h.points.map((p) => p.unitPrice)),
        pct: round((ratio - 1) * 100, 1),
        // Annualising a three-week sample produces nonsense, so it stays null.
        annualisedPct: spanDays >= 30 ? round((ratio ** (365 / spanDays) - 1) * 100, 1) : null,
        spanDays,
        points: h.points.length,
        spend: h.spend,
      };
    })
    .sort((a, b) => b.pct - a.pct);

/**
 * Two averages, because they answer different questions: the plain mean is "how
 * much did a typical item move", the spend-weighted one is "how much did my bill
 * move" - a 40% jump in cardamom matters less than 8% on rice.
 */
export const averageInflation = (items: ItemInflation[]) => {
  if (items.length === 0) return { avgPct: null, weightedPct: null, items: 0 };
  const spend = sum(items.map((i) => i.spend));
  return {
    avgPct: round(mean(items.map((i) => i.pct)), 1),
    weightedPct: spend > 0 ? round(sum(items.map((i) => i.pct * i.spend)) / spend, 1) : null,
    items: items.length,
  };
};

/**
 * Spend-weighted basket index, first month = 100. An item enters the index from
 * the month of its first price, and its last known price is carried forward
 * through months it was not bought in - otherwise the index would track what we
 * happened to shop for rather than what things cost.
 */
export const priceIndex = (history: History[]): { month: string; index: number; items: number }[] => {
  const tracked = history.filter((h) => new Set(h.points.map((p) => p.month)).size >= 2);
  if (tracked.length === 0) return [];
  const allMonths = tracked.flatMap((h) => h.points.map((p) => p.month)).sort();
  const months = monthRange(allMonths[0], allMonths[allMonths.length - 1]);

  const tracks = tracked.map((h) => {
    const byMonth = new Map<string, number[]>();
    for (const p of h.points) byMonth.set(p.month, [...(byMonth.get(p.month) ?? []), p.unitPrice]);
    return {
      weight: h.spend,
      basePrice: h.points[0].unitPrice,
      firstMonth: h.points[0].month,
      avg: new Map([...byMonth].map(([m, ps]) => [m, mean(ps)])),
    };
  });

  const carried = tracks.map(() => 0);
  const out: { month: string; index: number; items: number }[] = [];
  for (const month of months) {
    let weight = 0;
    let acc = 0;
    tracks.forEach((t, i) => {
      if (month < t.firstMonth || t.basePrice <= 0) return;
      carried[i] = t.avg.get(month) ?? carried[i];
      if (carried[i] <= 0) return;
      weight += t.weight;
      acc += t.weight * (carried[i] / t.basePrice);
    });
    const index = weight > 0 ? round((acc / weight) * 100, 1) : (out[out.length - 1]?.index ?? 100);
    out.push({ month, index, items: tracked.length });
  }
  return out;
};

export type Deviation = {
  name: string;
  date: string;
  base: string;
  expected: number;
  actual: number;
  cost: number;
  pct: number;
};

/**
 * Per-purchase price deviation: what the item had averaged before this purchase
 * against what it actually cost. This is the scatter - a point above the
 * diagonal is a purchase made above its own running price.
 */
export const priceDeviations = (history: History[]): Deviation[] =>
  history.flatMap((h) =>
    h.points.slice(1).map((p, i) => {
      const expected = round(mean(h.points.slice(0, i + 1).map((q) => q.unitPrice)), 4);
      return {
        name: h.name,
        date: p.date,
        base: h.base,
        expected,
        actual: p.unitPrice,
        cost: p.cost,
        pct: expected > 0 ? round(((p.unitPrice - expected) / expected) * 100, 1) : 0,
      };
    }),
  );

export const groupSpend = <T extends { cost: number }>(lines: T[], by: (l: T) => string) => {
  const map = new Map<string, number>();
  for (const l of lines) {
    const k = by(l);
    map.set(k, (map.get(k) ?? 0) + l.cost);
  }
  return [...map.entries()].map(([name, spend]) => ({ name, spend: round(spend) })).sort((a, b) => b.spend - a.spend);
};

export type ItemPurchase = PricePoint & { store: string; qty: number; unit: string };

export type ItemReport = {
  key: string;
  name: string;
  base: string;
  purchases: ItemPurchase[];
  /** Lines dropped because they were bought in a base that doesn't compare. */
  otherBases: number;
  spend: number;
  quantity: number;
  first: number;
  latest: number;
  best: number;
  worst: number;
  avg: number;
  pct: number | null;
  annualisedPct: number | null;
  firstDate: string;
  lastDate: string;
  daysSince: number;
  /** Mean days between purchases, over distinct purchase dates. */
  cadenceDays: number | null;
  nextDue: string | null;
  byStore: { name: string; purchases: number; spend: number; avg: number; best: number }[];
};

const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Everything known about one item's buying history: the price of every purchase
 * from the first bill onward, how often it gets bought, and which shop has been
 * cheapest. Matched on the inventory id when the line was entered from the
 * inventory, and on the name otherwise, so free-typed bills still line up.
 */
export const itemReport = (
  lines: Line[],
  item: { id?: string | null; name: string },
  today = new Date().toISOString().slice(0, 10),
): ItemReport | null => {
  const key = itemKey(item.name);
  const mine = lines.filter((l) => (item.id && l.itemId === item.id) || l.key === key);
  const [history] = priceHistory(mine);
  if (!history) return null;

  const kept = mine
    .filter((l) => l.base === history.base)
    .sort((a, b) => a.date.localeCompare(b.date));

  const purchases: ItemPurchase[] = kept.map((l) => ({
    date: l.date,
    month: monthOf(l.date),
    unitPrice: round(l.unitPrice, 4),
    cost: round(l.cost),
    store: l.store,
    qty: l.qty,
    unit: l.unit,
  }));

  const prices = purchases.map((p) => p.unitPrice);
  const firstDate = purchases[0].date;
  const lastDate = purchases[purchases.length - 1].date;
  const spanDays = daysBetween(firstDate, lastDate);
  const ratio = purchases[0].unitPrice > 0 ? prices[prices.length - 1] / prices[0] : 0;

  // Distinct dates: two shops on one Saturday is one shopping occasion, and
  // counting it twice would halve the apparent cadence.
  const dates = [...new Set(purchases.map((p) => p.date))];
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  const cadenceDays = gaps.length ? round(mean(gaps), 0) : null;

  const stores = new Map<string, number[]>();
  for (const p of purchases) stores.set(p.store, [...(stores.get(p.store) ?? []), p.unitPrice]);

  return {
    key,
    name: history.name,
    base: history.base,
    purchases,
    otherBases: mine.length - kept.length,
    spend: round(sum(purchases.map((p) => p.cost))),
    quantity: round(sum(kept.map((l) => l.baseQty)), 3),
    first: prices[0],
    latest: prices[prices.length - 1],
    best: Math.min(...prices),
    worst: Math.max(...prices),
    avg: round(mean(prices), 4),
    pct: prices.length >= 2 && prices[0] > 0 ? round((ratio - 1) * 100, 1) : null,
    annualisedPct:
      prices.length >= 2 && prices[0] > 0 && spanDays >= 30 ? round((ratio ** (365 / spanDays) - 1) * 100, 1) : null,
    firstDate,
    lastDate,
    daysSince: daysBetween(lastDate, today),
    cadenceDays,
    nextDue: cadenceDays && cadenceDays >= 1 ? addDays(lastDate, cadenceDays) : null,
    byStore: [...stores.entries()]
      .map(([name, ps]) => ({
        name,
        purchases: ps.length,
        spend: round(sum(purchases.filter((p) => p.store === name).map((p) => p.cost))),
        avg: round(mean(ps), 2),
        best: round(Math.min(...ps), 2),
      }))
      // Cheapest on average, then by the best price it has ever offered, so a
      // tie resolves to the shop that has actually been cheapest once.
      .sort((a, b) => a.avg - b.avg || a.best - b.best || b.purchases - a.purchases || a.name.localeCompare(b.name)),
  };
};

/** What the bill form needs in order to say whether today's price is a good one. */
export const priceBook = (history: History[]) =>
  Object.fromEntries(
    history.map((h) => [
      h.key,
      {
        name: h.name,
        base: h.base,
        last: h.points[h.points.length - 1].unitPrice,
        lastDate: h.points[h.points.length - 1].date,
        best: Math.min(...h.points.map((p) => p.unitPrice)),
        avg: round(mean(h.points.map((p) => p.unitPrice)), 4),
        points: h.points.length,
      },
    ]),
  );

export const analyse = (lines: Line[]) => {
  const history = priceHistory(lines);
  const perItem = itemInflation(history);
  const monthly = spendByMonth(lines);
  const index = priceIndex(history);
  const dates = lines.map((l) => l.date).sort();
  const bills = new Set(lines.map((l) => l.billId)).size;
  const spend = round(sum(lines.map((l) => l.cost)));

  return {
    totals: {
      spend,
      bills,
      lines: lines.length,
      items: history.length,
      months: monthly.length,
      perBill: bills > 0 ? round(spend / bills) : 0,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
    },
    byCategory: groupSpend(lines, (l) => l.category || "Uncategorised"),
    byStore: groupSpend(lines, (l) => l.store || "Unknown"),
    monthly,
    projection: projectSpend(monthly),
    deviation: monthDeviation(monthly),
    index,
    inflation: {
      ...averageInflation(perItem),
      basketPct: index.length >= 2 ? round(index[index.length - 1].index - 100, 1) : null,
      perItem,
    },
    deviations: priceDeviations(history),
    priceBook: priceBook(history),
    /** Flat lines, so the client can group spend by inventory tag without a second route. */
    lines,
  };
};

export type Analytics = ReturnType<typeof analyse>;
