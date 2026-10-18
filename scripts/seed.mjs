/**
 * Seeds the database: the starter inventory, and demo bills so the analytics
 * page has something to show before you have entered months of real shopping.
 *
 *   node scripts/seed.mjs          seed empty collections (refuses a full one)
 *   node scripts/seed.mjs --clear  wipe both collections first
 *
 * The inventory is real starter data. The prices on the demo bills are
 * invented, and every demo bill is noted as such.
 */

import { normalizeBill } from "../lib/bill.ts";
import { normalizeInventory } from "../lib/inventory.ts";
import { bills, categories } from "../server/db.ts";
import { STARTER_CATEGORIES } from "./starter-inventory.mjs";

const MONTHS = 8; // ending with the current month
const STORES = ["Reliance Fresh", "DMart", "Local kirana", "BigBasket"];

/** Deterministic PRNG, so re-seeding gives the same demo numbers. */
let seed = 20261018;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

/** price per inventory unit, annual drift, how often it lands in a bill */
const PRICES = {
  "Toor dal": [180, 0.14, 0.7],
  "Basmati rice": [120, 0.09, 0.6],
  Atta: [48, 0.07, 0.8],
  "Mustard oil": [185, 0.16, 0.6],
  "Tea leaves": [130, 0.11, 0.7],
  Sugar: [46, 0.05, 0.5],
  "Dish soap bar": [22, 0.04, 0.6],
  "Detergent powder": [130, 0.08, 0.5],
  "Floor cleaner": [180, 0.06, 0.4],
  "Toilet cleaner": [95, 0.05, 0.4],
  "Garbage bags": [85, 0.1, 0.6],
  Toothpaste: [110, 0.06, 0.5],
  "Hand wash refill": [90, 0.03, 0.4],
  Shampoo: [240, 0.07, 0.3],
  "LED bulb 9W": [95, -0.02, 0.2],
  "AAA batteries": [35, 0.02, 0.25],
  "Carrom powder": [60, 0.03, 0.15],
  "Playing cards": [70, 0.0, 0.1],
  Shuttlecocks: [45, 0.05, 0.2],
  "A4 paper": [320, 0.12, 0.25],
  "Ball pens": [10, 0.02, 0.35],
  "Sticky notes": [45, 0.03, 0.2],
  "Glue stick": [25, 0.04, 0.2],
  Paracetamol: [22, 0.03, 0.3],
  "Band-aids": [4, 0.02, 0.2],
  Multivitamin: [450, 0.09, 0.2],
  "ORS sachets": [22, 0.04, 0.3],
  "Mosquito repellent refill": [85, 0.06, 0.4],
};

const catalogue = STARTER_CATEGORIES.flatMap((c) =>
  c.items
    .filter((i) => PRICES[i.name])
    .map((i) => ({
      name: i.name,
      itemId: i.id,
      category: c.name,
      unit: i.unit,
      price: PRICES[i.name][0],
      drift: PRICES[i.name][1],
      chance: PRICES[i.name][2],
    })),
);

if (catalogue.length === 0) {
  console.error("No inventory items matched the demo price list. Nothing to seed.");
  process.exit(1);
}

const now = new Date();
const monthStart = (back) => new Date(now.getFullYear(), now.getMonth() - back, 1);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Buy weight-priced staples in grams sometimes, so unit conversion gets used. */
const asBought = (item, unitPriceNow) => {
  if (item.unit === "kg" && rnd() < 0.35) {
    const grams = pick([250, 500, 500, 750]);
    return { qty: grams, unit: "g", cost: (unitPriceNow * grams) / 1000 };
  }
  const qty = item.unit === "pc" ? pick([1, 2, 2, 4]) : pick([1, 1, 1, 2]);
  return { qty, unit: item.unit, cost: unitPriceNow * qty };
};

const drafts = [];
for (let back = MONTHS - 1; back >= 0; back--) {
  const start = monthStart(back);
  const age = (MONTHS - 1 - back) / 12; // years since the first month
  const billsThisMonth = back === 0 && now.getDate() < 12 ? 1 : rnd() < 0.5 ? 2 : 3;

  for (let b = 0; b < billsThisMonth; b++) {
    const day = Math.min(2 + Math.floor(rnd() * 26), back === 0 ? now.getDate() : 28);
    const date = iso(new Date(start.getFullYear(), start.getMonth(), day));

    const items = catalogue
      .filter(() => rnd() < 0.45)
      .filter((item) => rnd() < item.chance)
      .map((item) => {
        const trend = item.price * (1 + item.drift) ** age;
        const noise = 1 + (rnd() - 0.5) * 0.05; // shop-to-shop variation
        const { qty, unit, cost } = asBought(item, trend * noise);
        return {
          name: item.name,
          itemId: item.itemId,
          category: item.category,
          qty,
          unit,
          cost: Math.round(cost * 100) / 100,
        };
      });

    if (items.length > 0) drafts.push({ date, store: pick(STORES), note: "demo data", items });
  }
}

const billsCollection = await bills();
const categoriesCollection = await categories();

if (process.argv.includes("--clear")) {
  const gone = [await billsCollection.deleteMany({}), await categoriesCollection.deleteMany({})];
  console.log(`cleared ${gone[0].deletedCount} bills and ${gone[1].deletedCount} categories`);
} else if ((await billsCollection.countDocuments({})) + (await categoriesCollection.countDocuments({})) > 0) {
  console.error("The database is not empty. Re-run with --clear to replace it.");
  process.exit(1);
}

// Through the same validation the API uses, so seed data can never be a shape
// the app itself would have rejected.
const checked = normalizeInventory({ categories: STARTER_CATEGORIES });
if ("error" in checked) throw new Error(`starter inventory is invalid: ${checked.error}`);

await categoriesCollection.insertMany(
  checked.inventory.categories.map((c, order) => ({ _id: c.id, name: c.name, items: c.items, order })),
);
console.log(
  `seeded ${checked.inventory.categories.length} categories, ` +
    `${checked.inventory.categories.reduce((n, c) => n + c.items.length, 0)} items`,
);

const docs = drafts.map((draft) => {
  const result = normalizeBill(draft);
  if ("error" in result) throw new Error(`seed produced an invalid bill: ${result.error}`);
  return { ...result.bill, createdAt: new Date(`${draft.date}T12:00:00Z`) };
});

await billsCollection.insertMany(docs);
const total = docs.reduce((t, d) => t + d.total, 0);
console.log(
  `seeded ${docs.length} bills, ${docs.reduce((n, d) => n + d.items.length, 0)} lines, ` +
    `${docs[0].date} to ${docs[docs.length - 1].date}, total ₹${Math.round(total).toLocaleString("en-IN")}`,
);
process.exit(0);
