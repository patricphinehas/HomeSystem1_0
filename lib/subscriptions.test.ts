import assert from "node:assert/strict";
import { test } from "node:test";
import {
  monthlyCost,
  normalizeSubscriptions,
  subscriptionTotals,
  yearlyCost,
  type SubscriptionsDoc,
} from "./subscriptions.ts";

test("subscriptions require a name and valid share count when shareable", () => {
  const ok = normalizeSubscriptions({
    subscriptions: [
      {
        id: "s1",
        name: "Netflix",
        type: "streaming",
        tag: "entertainment",
        holder: "Pat",
        shareable: true,
        shareCount: 4,
      },
    ],
  });
  assert.ok("doc" in ok);

  const bad = normalizeSubscriptions({
    subscriptions: [{ id: "s2", name: "Spotify", shareable: true, shareCount: 0 }],
  });
  assert.ok("error" in bad);
});

test("cost and cycle are put on one scale", () => {
  const base = { id: "s", name: "x", type: "", tag: "", holder: "", shareable: false, shareCount: null };
  const { doc } = normalizeSubscriptions({
    subscriptions: [
      { ...base, id: "m", cost: 199, cycle: "monthly" },
      { ...base, id: "y", cost: 1200, cycle: "yearly" },
      { ...base, id: "q", cost: 300, cycle: "quarterly" },
      { ...base, id: "w", cost: 10, cycle: "weekly" },
      { ...base, id: "o", cost: 5000, cycle: "one-off" },
    ],
  }) as { doc: SubscriptionsDoc };

  assert.equal(yearlyCost(doc.subscriptions[0]), 2388);
  assert.equal(monthlyCost(doc.subscriptions[1]), 100);
  assert.equal(yearlyCost(doc.subscriptions[2]), 1200);
  assert.equal(yearlyCost(doc.subscriptions[3]), 520);
  // A one-off is not a running cost, so it stays out of the recurring totals.
  assert.equal(yearlyCost(doc.subscriptions[4]), 0);

  const totals = subscriptionTotals(doc.subscriptions);
  assert.equal(totals.yearly, 2388 + 1200 + 1200 + 520);
  assert.equal(totals.oneOff, 5000);
  assert.equal(totals.monthly, 442.33);
});

test("a subscription stored before costs existed is a free monthly one", () => {
  const result = normalizeSubscriptions({
    subscriptions: [{ id: "old", name: "Netflix", shareable: false }],
  });
  assert.ok("doc" in result);
  assert.equal(result.doc.subscriptions[0].cost, 0);
  assert.equal(result.doc.subscriptions[0].cycle, "monthly");

  assert.ok("error" in normalizeSubscriptions({ subscriptions: [{ id: "a", name: "x", cost: -5 }] }));
  assert.ok("error" in normalizeSubscriptions({ subscriptions: [{ id: "a", name: "x", cycle: "fortnightly" }] }));
});
