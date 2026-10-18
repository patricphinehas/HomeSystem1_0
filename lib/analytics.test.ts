import { test } from "node:test";
import assert from "node:assert/strict";
import { cheapest, normalizeUnit, unitPrice } from "./units.ts";
import {
  analyse,
  averageInflation,
  itemInflation,
  itemKey,
  itemReport,
  monthDeviation,
  monthRange,
  priceDeviations,
  priceHistory,
  priceIndex,
  projectSpend,
  spendByMonth,
  type Line,
} from "./analytics.ts";

const line = (date: string, name: string, qty: number, unit: string, cost: number, category = "Groceries"): Line => {
  const up = unitPrice(qty, unit, cost)!;
  return {
    billId: date + name,
    date,
    store: "Local",
    name,
    key: itemKey(name),
    itemId: null,
    category,
    qty,
    unit,
    cost,
    base: up.base,
    baseQty: up.baseQty,
    unitPrice: up.price,
  };
};

test("unit price normalises mass, volume and count to one base", () => {
  assert.deepEqual(unitPrice(500, "g", 60), { base: "kg", baseQty: 0.5, price: 120, known: true });
  assert.deepEqual(unitPrice(1, "kg", 110), { base: "kg", baseQty: 1, price: 110, known: true });
  assert.equal(unitPrice(1, "dozen", 84)!.price, 7); // per piece
  assert.equal(unitPrice(2, "L", 300)!.price, 150);
  assert.equal(unitPrice(0, "kg", 100), null);
  assert.equal(unitPrice(1, "kg", -5), null);
});

test("an unrecognised unit becomes its own base instead of a wrong one", () => {
  assert.deepEqual(normalizeUnit("bottle"), { base: "bottle", factor: 1, known: false });
  assert.equal(unitPrice(2, "bottle", 190)!.base, "bottle");
  // Which also means it never compares against a per-kg price.
  assert.equal(cheapest([{ base: "kg", price: 110 }, { base: "bottle", price: 95 }]), null);
});

test("cheapest picks the lowest price per base unit, not the lowest bill", () => {
  const options = [
    { label: "1 kg pack", ...unitPrice(1, "kg", 110)! },
    { label: "500 g pack", ...unitPrice(500, "g", 60)! },
    { label: "5 kg sack", ...unitPrice(5, "kg", 520)! },
  ];
  assert.equal(cheapest(options)!.label, "5 kg sack");
});

test("month range spans the year boundary", () => {
  assert.deepEqual(monthRange("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(monthRange("2026-03", "2026-03"), ["2026-03"]);
});

test("a month with no bills reads as zero spend, not as a missing month", () => {
  const series = spendByMonth([line("2026-01-05", "Rice", 1, "kg", 100), line("2026-03-05", "Rice", 1, "kg", 120)]);
  assert.deepEqual(series, [
    { month: "2026-01", spend: 100 },
    { month: "2026-02", spend: 0 },
    { month: "2026-03", spend: 120 },
  ]);
});

test("projection follows the trend and never goes negative", () => {
  const rising = [
    { month: "2026-01", spend: 100 },
    { month: "2026-02", spend: 200 },
    { month: "2026-03", spend: 300 },
  ];
  assert.deepEqual(projectSpend(rising), [
    { month: "2026-04", spend: 400 },
    { month: "2026-05", spend: 500 },
    { month: "2026-06", spend: 600 },
  ]);

  const falling = rising.map((m, i) => ({ ...m, spend: 300 - i * 100 }));
  assert.deepEqual(
    projectSpend(falling).map((m) => m.spend),
    [0, 0, 0],
  );
});

test("deviation compares the latest month with the three before it", () => {
  const series = [
    { month: "2026-01", spend: 100 },
    { month: "2026-02", spend: 200 },
    { month: "2026-03", spend: 300 },
    { month: "2026-04", spend: 800 },
  ];
  assert.deepEqual(monthDeviation(series), {
    month: "2026-04",
    expected: 200,
    actual: 800,
    diff: 600,
    pct: 300,
  });
  assert.equal(monthDeviation(series.slice(0, 1)), null);
});

const lines = [
  line("2026-01-05", "Rice", 1, "kg", 100),
  line("2026-01-05", "Dal", 1, "kg", 50),
  line("2026-02-05", "Dal", 1, "kg", 50),
  line("2026-03-05", "Rice", 1, "kg", 120),
];

test("price history keeps the base an item is mostly bought in", () => {
  const mixed = [...lines, line("2026-03-05", "Rice", 1, "pack", 500)];
  const rice = priceHistory(mixed).find((h) => h.key === "rice")!;
  assert.equal(rice.base, "kg");
  assert.deepEqual(
    rice.points.map((p) => p.unitPrice),
    [100, 120],
  );
});

test("per-item inflation, and annualising only over a long enough span", () => {
  const [rice] = itemInflation(priceHistory(lines));
  assert.equal(rice.name, "Rice");
  assert.equal(rice.pct, 20);
  assert.equal(rice.spanDays, 59);
  assert.ok(rice.annualisedPct! > rice.pct, "two months of +20% annualises to more than 20%");

  const quick = itemInflation(priceHistory([line("2026-01-05", "Milk", 1, "L", 60), line("2026-01-20", "Milk", 1, "L", 66)]));
  assert.equal(quick[0].pct, 10);
  assert.equal(quick[0].annualisedPct, null);
});

test("average inflation is reported plain and spend-weighted", () => {
  const avg = averageInflation(itemInflation(priceHistory(lines)));
  assert.equal(avg.items, 2);
  assert.equal(avg.avgPct, 10); // Rice +20, Dal 0
  assert.equal(avg.weightedPct, 13.8); // Rice carries 220 of the 320 spent
});

test("the basket index starts at 100 and carries unbought months forward", () => {
  assert.deepEqual(priceIndex(priceHistory(lines)).map((r) => [r.month, r.index]), [
    ["2026-01", 100],
    ["2026-02", 100],
    ["2026-03", 113.8],
  ]);
});

test("each repeat purchase is scored against the item's running price", () => {
  const devs = priceDeviations(priceHistory(lines));
  assert.deepEqual(devs.find((d) => d.name === "Rice"), {
    name: "Rice",
    date: "2026-03-05",
    base: "kg",
    expected: 100,
    actual: 120,
    cost: 120,
    pct: 20,
  });
  // The first purchase of an item has nothing to deviate from.
  assert.equal(devs.length, 2);
});

test("analyse reports totals, breakdown and inflation together", () => {
  const a = analyse(lines);
  assert.equal(a.totals.spend, 320);
  assert.equal(a.totals.bills, 4);
  assert.equal(a.totals.items, 2);
  assert.deepEqual(a.byCategory, [{ name: "Groceries", spend: 320 }]);
  assert.equal(a.inflation.weightedPct, 13.8);
  assert.equal(a.inflation.basketPct, 13.8);
  assert.equal(a.priceBook["rice"].best, 100);
  assert.equal(a.priceBook["rice"].last, 120);
  assert.equal(a.projection.length, 3);
});

test("empty input produces an empty report rather than throwing", () => {
  const a = analyse([]);
  assert.equal(a.totals.spend, 0);
  assert.deepEqual(a.monthly, []);
  assert.deepEqual(a.projection, []);
  assert.equal(a.deviation, null);
  assert.equal(a.inflation.avgPct, null);
});

test("one item's whole buying history, from the first bill onward", () => {
  const history = [
    line("2026-01-05", "Rice", 1, "kg", 100),
    line("2026-02-04", "Rice", 1, "kg", 110),
    line("2026-03-05", "Rice", 1, "kg", 120),
  ];
  // Same shopping day, two shops: one occasion for cadence, two purchases.
  history[1].store = "DMart";

  const r = itemReport(history, { name: "rice" }, "2026-03-20")!;
  assert.equal(r.name, "Rice");
  assert.equal(r.base, "kg");
  assert.equal(r.purchases.length, 3);
  assert.deepEqual(r.purchases.map((p) => p.unitPrice), [100, 110, 120]);
  assert.equal(r.spend, 330);
  assert.equal(r.quantity, 3);
  assert.equal(r.best, 100);
  assert.equal(r.worst, 120);
  assert.equal(r.avg, 110);
  assert.equal(r.pct, 20);
  assert.equal(r.firstDate, "2026-01-05");
  assert.equal(r.lastDate, "2026-03-05");
  assert.equal(r.daysSince, 15);
  assert.equal(r.cadenceDays, 30); // 30 and 29 days between the three dates
  assert.equal(r.nextDue, "2026-04-04");
  // Both average 110; Local ranks first because it has offered the lowest price.
  assert.deepEqual(r.byStore.map((s) => [s.name, s.purchases, s.avg, s.best]), [
    ["Local", 2, 110, 100],
    ["DMart", 1, 110, 110],
  ]);
});

test("an item report matches on inventory id as well as on name", () => {
  const byId = [
    { ...line("2026-01-05", "Toor dal", 1, "kg", 180), itemId: "g1" },
    { ...line("2026-02-05", "toor  dal", 1, "kg", 190), itemId: null },
    { ...line("2026-02-05", "Sugar", 1, "kg", 45), itemId: "g6" },
  ];

  const r = itemReport(byId, { id: "g1", name: "Toor dal" }, "2026-02-10")!;
  assert.equal(r.purchases.length, 2, "the free-typed repeat matches by name");
  assert.equal(r.latest, 190);

  assert.equal(itemReport(byId, { id: "nope", name: "Never bought" }), null);
});

test("purchases in a base that does not compare are counted out, not in", () => {
  const mixed = [
    line("2026-01-05", "Atta", 1, "kg", 48),
    line("2026-02-05", "Atta", 1, "kg", 50),
    line("2026-03-05", "Atta", 1, "sack", 460),
  ];

  const r = itemReport(mixed, { name: "Atta" }, "2026-03-10")!;
  assert.equal(r.base, "kg");
  assert.equal(r.purchases.length, 2);
  assert.equal(r.otherBases, 1);
  assert.equal(r.spend, 98);
});

test("a single purchase reports what it can and nothing it cannot", () => {
  const r = itemReport([line("2026-05-05", "Shampoo", 1, "bottle", 240)], { name: "Shampoo" }, "2026-05-15")!;
  assert.equal(r.purchases.length, 1);
  assert.equal(r.base, "bottle");
  assert.equal(r.pct, null);
  assert.equal(r.annualisedPct, null);
  assert.equal(r.cadenceDays, null);
  assert.equal(r.nextDue, null);
  assert.equal(r.daysSince, 10);
});
