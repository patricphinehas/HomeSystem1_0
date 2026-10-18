import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allTags,
  isLow,
  lowStock,
  normalizeInventory,
  tagIndex,
  totals,
  type Inventory,
} from "./inventory.ts";

const inv: Inventory = {
  categories: [
    {
      id: "c1",
      name: "Groceries",
      items: [
        { id: "a", name: "Toor dal", room: "Kitchen", qty: 2, unit: "kg", min: 1 },
        { id: "b", name: "Mustard oil", room: "Kitchen", qty: 1, unit: "L", min: 1 },
        { id: "c", name: "Rock salt", room: "Kitchen", qty: 0, unit: "kg", min: 1 },
      ],
    },
    { id: "c2", name: "Games", items: [] },
  ],
};

test("low stock is at-or-below minimum, not just below", () => {
  assert.equal(isLow(inv.categories[0].items[0]), false);
  assert.equal(isLow(inv.categories[0].items[1]), true);
  assert.deepEqual(
    lowStock(inv).map((i) => i.name),
    ["Mustard oil", "Rock salt"],
  );
  assert.equal(lowStock(inv)[0].category, "Groceries");
});

test("totals counts across categories", () => {
  assert.deepEqual(totals(inv), { categories: 2, items: 3, low: 2, out: 1 });
});

const ok = (input: unknown): Inventory => {
  const result = normalizeInventory(input);
  assert.ok("inventory" in result, "error" in result ? result.error : "no inventory");
  return result.inventory;
};

const err = (input: unknown): string => {
  const result = normalizeInventory(input);
  assert.ok("error" in result, "expected a rejection");
  return result.error;
};

test("an inventory document is normalised on its way into the database", () => {
  const stored = ok({
    categories: [
      {
        id: "groceries",
        name: "  Groceries ",
        items: [{ id: "g1", name: " Toor dal ", room: "Kitchen", qty: "2", unit: " kg ", min: 1, tags: ["Staple", "staple", " monthly "] }],
      },
    ],
  });

  assert.deepEqual(stored.categories[0], {
    id: "groceries",
    name: "Groceries",
    items: [{ id: "g1", name: "Toor dal", room: "Kitchen", qty: 2, unit: "kg", min: 1, tags: ["staple", "monthly"] }],
  });
});

test("names may be blank mid-edit, but ids and numbers may not be wrong", () => {
  // The UI saves on each keystroke, so an emptied name field must still store.
  assert.equal(ok({ categories: [{ id: "c", name: "", items: [] }] }).categories[0].name, "");

  assert.match(err(null), /inventory object/);
  assert.match(err({}), /categories/);
  assert.match(err({ categories: [{ name: "No id", items: [] }] }), /has no id/);
  assert.match(err({ categories: [{ id: "c", items: "nope" }] }), /items must be a list/);
  assert.match(err({ categories: [{ id: "a", items: [] }, { id: "a", items: [] }] }), /duplicate id "a"/);
  assert.match(err({ categories: [{ id: "c", items: [{ id: "i", qty: -1, min: 0 }] }] }), /quantity must be zero or more/);
  assert.match(err({ categories: [{ id: "c", items: [{ id: "i", qty: 1, min: "x" }] }] }), /minimum must be zero or more/);
  assert.match(err({ categories: [{ id: "c", items: [{ id: "i", qty: 1, min: 1 }, { id: "i", qty: 1, min: 1 }] }] }), /duplicate id "i"/);
  assert.match(err({ categories: Array(51).fill({ id: "c", items: [] }) }), /50 categories/);
});

test("tags and the tag index come back off a stored inventory", () => {
  const stored = ok({
    categories: [
      { id: "c1", items: [{ id: "a", name: "Dal", qty: 1, unit: "kg", min: 1, tags: ["staple"] }] },
      { id: "c2", items: [{ id: "b", name: "Cards", qty: 1, unit: "deck", min: 1 }] },
    ],
  });

  assert.deepEqual(allTags(stored), ["staple"]);
  assert.deepEqual(tagIndex(stored).get("a"), ["staple"]);
  assert.deepEqual(tagIndex(stored).get("b"), []);
});
