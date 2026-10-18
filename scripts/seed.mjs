/**
 * Seeds the database so every page has something to show before you have
 * entered months of real shopping: the starter inventory, demo bills behind the
 * analytics, a few subscriptions, and a calendar with things either side of
 * today.
 *
 *   node scripts/seed.mjs          seed an empty database (refuses a full one)
 *   node scripts/seed.mjs --clear  wipe the tables first
 *
 * The inventory is real starter data. Everything else is invented and says so:
 * each bill is noted "demo data" and so is every calendar entry, so a seeded
 * database is never mistaken for a used one. Subscriptions, the calendar and
 * the inventory are each written whole, replacing whatever was there.
 */

import { normalizeBill } from "../lib/bill.ts";
import { normalizeCalendar } from "../lib/calendar.ts";
import { normalizeFamily } from "../lib/family.ts";
import { normalizeInventory } from "../lib/inventory.ts";
import { normalizeSubscriptions } from "../lib/subscriptions.ts";
import {
  applySchema,
  clear,
  close,
  counts,
  insertBills,
  writeCalendar,
  writeFamily,
  writeInventory,
  writeSubscriptions,
} from "../server/db.ts";
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

/** Demo subscriptions: one of each kind the page can show, shared and not. */
const SUBSCRIPTIONS = [
  { id: "sub-stream-1", name: "Netflix", type: "streaming", tag: "entertainment", holder: "Dad", shareable: true, shareCount: 4, cost: 649, cycle: "monthly" },
  { id: "sub-stream-2", name: "Spotify Family", type: "streaming", tag: "entertainment", holder: "Anu", shareable: true, shareCount: 6, cost: 179, cycle: "monthly" },
  { id: "sub-cloud-1", name: "Google One 200GB", type: "cloud", tag: "home", holder: "Dad", shareable: true, shareCount: 5, cost: 1300, cycle: "yearly" },
  { id: "sub-news-1", name: "The Hindu", type: "news", tag: "home", holder: "Mum", shareable: false, shareCount: null, cost: 299, cycle: "quarterly" },
  { id: "sub-utility-1", name: "Broadband", type: "utility", tag: "home", holder: "Dad", shareable: false, shareCount: null, cost: 999, cycle: "monthly" },
  { id: "sub-software-1", name: "Password manager", type: "software", tag: "home", holder: "Ravi", shareable: true, shareCount: 5, cost: 3200, cycle: "yearly" },
];

/** The household the demo data belongs to, seeded into the family collection. */
const PEOPLE = [
  { id: "person-1", name: "Dad", role: "parent" },
  { id: "person-2", name: "Mum", role: "parent" },
  { id: "person-3", name: "Anu", role: "child" },
  { id: "person-4", name: "Ravi", role: "child" },
];

/**
 * Demo calendar. Things sit either side of today and one is in next month, so
 * the grid, "Coming up" and paging forward all have something in them straight
 * after a seed — and between them they use every field an entry has.
 */
const EVENTS = [
  {
    at: [-24, "10:30", "11:15"],
    kind: "appointment",
    title: "Dentist",
    venue: "Smile Dental, MG Road",
    people: ["Anu"],
    rsvp: { Anu: "yes" },
    createdBy: "Mum",
  },
  {
    at: [-10, "19:30", "22:00"],
    kind: "movie",
    title: "Film night — Interstellar",
    venue: "PVR Forum",
    link: "https://in.bookmyshow.com/",
    people: ["Dad", "Mum", "Anu", "Ravi"],
    rsvp: { Dad: "yes", Mum: "yes", Anu: "yes", Ravi: "no" },
    reservation: "booked",
    reservedUnder: "Dad",
    createdBy: "Dad",
    comments: [["Dad", "Row H, four seats."], ["Anu", "Can we eat before? The interval queue is always mad."]],
  },
  { at: [-3, "", ""], kind: "chore", title: "Gas cylinder refill", people: ["Ravi"], createdBy: "Mum" },
  { at: [0, "", ""], kind: "chore", title: "Bin day", people: ["Ravi"], rsvp: { Ravi: "yes" }, createdBy: "Mum" },
  { at: [1, "18:00", "19:00"], kind: "chore", title: "Grocery run", venue: "DMart", people: ["Mum", "Anu"], createdBy: "Mum" },
  {
    at: [3, "20:00", "23:00"],
    kind: "movie",
    title: "Movie night",
    venue: "Living room",
    people: ["Dad", "Mum", "Anu", "Ravi"],
    rsvp: { Dad: "yes", Mum: "maybe", Anu: "yes" },
    createdBy: "Anu",
    comments: [["Mum", "Somebody pick a film this time, not three trailers and bed."]],
  },
  {
    at: [9, "19:00", "22:30"],
    kind: "dinner",
    title: "Neighbours over for dinner",
    venue: "Home",
    people: ["Dad", "Mum", "Anu", "Ravi"],
    rsvp: { Dad: "yes", Mum: "yes" },
    reservation: "needed",
    createdBy: "Mum",
  },
  { at: [16, "09:00", "11:00"], kind: "appointment", title: "Car service", venue: "Service centre", people: ["Dad"], createdBy: "Dad" },
  { at: [27, "", ""], kind: "chore", title: "Rent due", people: ["Dad"], createdBy: "Dad" },
];

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

/**
 * A date this many days from today, in local time. Local throughout, because
 * that is what `today()` compares a bill against and what the calendar stores;
 * a UTC day here is yesterday for half of IST's day and the bills get rejected.
 */
const dayFrom = (days) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));

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

// Postgres gets its tables here; Mongo gets its indexes. Safe to re-run.
await applySchema();

const before = await counts();
if (process.argv.includes("--clear")) {
  await clear();
  console.log(`cleared ${before.bills} bills and ${before.categories} categories`);
} else if (before.bills + before.categories > 0) {
  console.error("The database is not empty. Re-run with --clear to replace it.");
  await close();
  process.exit(1);
}

// Through the same validation the API uses, so seed data can never be a shape
// the app itself would have rejected.
const checked = normalizeInventory({ categories: STARTER_CATEGORIES });
if ("error" in checked) throw new Error(`starter inventory is invalid: ${checked.error}`);

await writeInventory(checked.inventory);
console.log(
  `seeded ${checked.inventory.categories.length} categories, ` +
    `${checked.inventory.categories.reduce((n, c) => n + c.items.length, 0)} items`,
);

const seededBills = drafts.map((draft) => {
  const result = normalizeBill(draft);
  if ("error" in result) throw new Error(`seed produced an invalid bill: ${result.error}`);
  return result.bill;
});

await insertBills(seededBills);
const total = seededBills.reduce((t, b) => t + b.total, 0);
console.log(
  `seeded ${seededBills.length} bills, ${seededBills.reduce((n, b) => n + b.items.length, 0)} lines, ` +
    `${seededBills[0].date} to ${seededBills[seededBills.length - 1].date}, ` +
    `total ₹${Math.round(total).toLocaleString("en-IN")}`,
);

// Same rule as the bills: through the app's own validators, so the seed can
// never write a shape the app would refuse.
const household = normalizeFamily({ people: PEOPLE });
if ("error" in household) throw new Error(`demo household is invalid: ${household.error}`);
await writeFamily(household.doc);
console.log(`seeded ${household.doc.people.length} people: ${household.doc.people.map((p) => p.name).join(", ")}`);

const subs = normalizeSubscriptions({ subscriptions: SUBSCRIPTIONS });
if ("error" in subs) throw new Error(`demo subscriptions are invalid: ${subs.error}`);
await writeSubscriptions(subs.doc);
console.log(`seeded ${subs.doc.subscriptions.length} subscriptions`);

const calendar = normalizeCalendar({
  events: EVENTS.map((event, i) => {
    const [days, time, endTime] = event.at;
    return {
      ...event,
      at: undefined,
      id: `demo-event-${i + 1}`,
      date: dayFrom(days),
      time,
      endTime,
      notes: "demo data",
      // Comments are [who, what]; the timestamps are spread over the days
      // before the event so the thread reads in order.
      comments: (event.comments ?? []).map(([by, text], c) => ({
        id: `demo-comment-${i + 1}-${c + 1}`,
        by,
        at: new Date(Date.parse(`${dayFrom(days - 2)}T10:00:00`) + c * 3600_000).toISOString(),
        text,
      })),
    };
  }),
});
if ("error" in calendar) throw new Error(`demo calendar is invalid: ${calendar.error}`);
await writeCalendar(calendar.doc);
const dates = calendar.doc.events.map((e) => e.date);
console.log(`seeded ${calendar.doc.events.length} calendar events, ${dates[0]} to ${dates[dates.length - 1]}`);

await close();
