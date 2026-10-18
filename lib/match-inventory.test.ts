import assert from "node:assert/strict";
import { test } from "node:test";
import type { Inventory } from "./inventory.ts";
import { addItemAlias, applyInventoryMatch, matchInventoryLine } from "./match-inventory.ts";

const inv: Inventory = {
  categories: [
    {
      id: "c1",
      name: "Snacks",
      items: [
        { id: "bisc", name: "Biscuit", room: "", qty: 0, unit: "pc", min: 0, aliases: ["britannia", "milkbikis"] },
        { id: "tea", name: "Tea", room: "", qty: 0, unit: "kg", min: 0, patterns: ["tea\\s*leaves?"] },
      ],
    },
  ],
};

test("match by name, alias, pattern, or explicit id", () => {
  assert.equal(matchInventoryLine("Biscuit", inv)?.via, "name");
  assert.equal(matchInventoryLine("Britannia Marie", inv)?.via, "alias");
  assert.equal(matchInventoryLine("Premium Tea leaves", inv)?.via, "pattern");
  assert.equal(matchInventoryLine("Unknown", inv), null);
  assert.equal(matchInventoryLine("x", inv, "bisc")?.via, "id");
});

test("applyInventoryMatch fills itemId on bill lines", () => {
  const out = applyInventoryMatch(
    [{ date: "2026-10-01", store: "A", items: [{ name: "Milkbikis", qty: 1, unit: "pc", cost: 10 }] }],
    inv,
  );
  assert.equal(out[0].items[0].itemId, "bisc");
  assert.equal(out[0].items[0].category, "Snacks");
});

test("addItemAlias dedupes by normalised key", () => {
  const next = addItemAlias(inv, "bisc", "  Britannia  ");
  assert.equal(next.categories[0].items[0].aliases?.length, 2);
  const again = addItemAlias(next, "bisc", "britannia");
  assert.equal(again.categories[0].items[0].aliases?.length, 2);
});
