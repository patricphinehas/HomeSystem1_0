import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWithHistory, normalizeBill, normalizeBills, sampleJson, today, validateImportJson, type Bill } from "./bill.ts";

const ok = (input: unknown): Bill => {
  const result = normalizeBill(input);
  assert.ok("bill" in result, "error" in result ? result.error : "no bill");
  return result.bill;
};

const err = (input: unknown): string => {
  const result = normalizeBill(input);
  assert.ok("error" in result, "expected a rejection");
  return result.error;
};

const base = {
  date: "2026-10-01",
  store: "Reliance Fresh",
  items: [{ name: "  Toor dal ", qty: "500", unit: "g", cost: "60" }],
};

test("a bill is normalised into stored shape, with a price per base unit", () => {
  const bill = ok(base);
  assert.equal(bill.total, 60);
  assert.deepEqual(bill.items[0], {
    name: "Toor dal",
    key: "toor dal",
    itemId: null,
    category: null,
    qty: 500,
    unit: "g",
    cost: 60,
    base: "kg",
    baseQty: 0.5,
    unitPrice: 120,
  });
});

test("the total is the sum of the lines, rounded to paise", () => {
  const bill = ok({
    ...base,
    items: [
      { name: "Rice", qty: 5, unit: "kg", cost: 519.5 },
      { name: "Oil", qty: 1, unit: "L", cost: 180.25 },
    ],
  });
  assert.equal(bill.total, 699.75);
});

test("every field is checked, because the API has no other gate", () => {
  assert.match(err(null), /bill object/);
  assert.match(err({ ...base, date: "01-10-2026" }), /yyyy-mm-dd/);
  assert.match(err({ ...base, date: "2099-01-01" }), /future/);
  assert.match(err({ ...base, store: "   " }), /store is required/);
  assert.match(err({ ...base, store: "x".repeat(81) }), /store is too long/);
  assert.match(err({ ...base, items: [] }), /at least one item/);
  assert.match(err({ ...base, items: Array(201).fill(base.items[0]) }), /more than 200/);
  assert.match(err({ ...base, items: [{ ...base.items[0], name: "" }] }), /needs a name/);
  assert.match(err({ ...base, items: [{ ...base.items[0], qty: 0 }] }), /greater than zero/);
  assert.match(err({ ...base, items: [{ ...base.items[0], qty: "abc" }] }), /greater than zero/);
  assert.match(err({ ...base, items: [{ ...base.items[0], cost: -1 }] }), /zero or more/);
});

test("today's date is accepted; a missing unit falls back to pieces", () => {
  const bill = ok({ ...base, date: today(), items: [{ name: "Candle", qty: 4, unit: "", cost: 40 }] });
  assert.equal(bill.items[0].unit, "pc");
  assert.equal(bill.items[0].unitPrice, 10);
});

test("a purchase is scored against the item's price reference", () => {
  const line = ok(base).items[0]; // 120/kg
  const ref = { name: "Toor dal", base: "kg", last: 130, lastDate: "2026-09-01", best: 118, avg: 125, points: 3 };

  assert.equal(compareWithHistory(line, ref).verdict, "cheaper");
  assert.equal(compareWithHistory(line, { ...ref, best: 120, last: 120 }).verdict, "best");
  assert.equal(compareWithHistory(line, { ...ref, best: 100, last: 100 }).verdict, "pricier");
  assert.equal(compareWithHistory(line, undefined).verdict, "new");
  // A per-bottle history says nothing about a per-kg purchase.
  assert.equal(compareWithHistory(line, { ...ref, base: "bottle" }).verdict, "new");
});

test("the sample in the UI is a valid import, not just illustrative", () => {
  const result = normalizeBills(JSON.parse(sampleJson()));
  assert.ok("bills" in result, "error" in result ? result.error : "no bills");
  assert.equal(result.bills.length, 2);
  // The 250 g line is normalised the same way a typed one would be.
  const tea = result.bills[0].items.find((i) => i.name === "Tea leaves")!;
  assert.equal(tea.base, "kg");
  assert.equal(tea.unitPrice, 528);
});

test("an import is all-or-nothing, and says which bill broke it", () => {
  const good = { date: "2026-10-01", store: "A", items: [{ name: "Rice", qty: 1, unit: "kg", cost: 100 }] };
  const bad = { ...good, items: [{ name: "Rice", qty: 1, unit: "kg", cost: -1 }] };

  const ok2 = normalizeBills([good, good]);
  assert.ok("bills" in ok2 && ok2.bills.length === 2);

  const failed = normalizeBills([good, bad, good]);
  assert.ok("error" in failed);
  assert.match(failed.error, /Bill 2 of 3: .*cost must be zero or more/);

  assert.match((normalizeBills([]) as { error: string }).error, /no bills in it/);
  assert.match((normalizeBills(Array(101).fill(good)) as { error: string }).error, /more than 100 bills/);
});

test("a single bill still works through the import path", () => {
  const result = normalizeBills({ date: "2026-10-01", store: "A", items: [{ name: "Rice", qty: 1, unit: "kg", cost: 100 }] });
  assert.ok("bills" in result);
  assert.equal(result.bills.length, 1);
});

test("validateImportJson parses and reuses normalizeBills", () => {
  assert.match((validateImportJson("{") as { error: string }).error, /Not valid JSON/);
  assert.ok("bills" in validateImportJson(sampleJson()));
});
