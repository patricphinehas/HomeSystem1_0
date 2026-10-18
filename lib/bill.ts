/**
 * Bill shape, validation and normalisation. Shared by the bill form (for the
 * live per-unit price) and by the Express route (as the trust boundary), so a
 * bill can only ever be stored in one shape.
 */

import { itemKey } from "./analytics.ts";
import { unitPrice } from "./units.ts";

export type LineInput = {
  name: string;
  itemId?: string | null;
  category?: string | null;
  qty: number | string;
  unit: string;
  cost: number | string;
};

export type BillInput = {
  date: string;
  store: string;
  note?: string;
  items: LineInput[];
};

export type BillLine = {
  name: string;
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

export type Bill = {
  date: string;
  store: string;
  note: string;
  total: number;
  items: BillLine[];
};

/** A bill as it comes back out of Mongo. */
export type StoredBill = Bill & { id: string; createdAt: string };

export const MAX_LINES = 200;

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").trim()));
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const isDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export const today = () => new Date().toISOString().slice(0, 10);

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Validate and normalise one submitted bill. Returns either the bill as it will
 * be stored, or the first thing wrong with it — the API has no other gate, so
 * every field is checked here.
 */
export function normalizeBill(input: unknown): { bill: Bill } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected a bill object." };
  const raw = input as Partial<BillInput>;

  if (!isDate(raw.date)) return { error: "date must be yyyy-mm-dd." };
  if (raw.date! > today()) return { error: "A bill cannot be dated in the future." };

  const store = str(raw.store);
  if (!store) return { error: "store is required." };
  if (store.length > 80) return { error: "store is too long (80 characters max)." };

  const note = str(raw.note);
  if (note.length > 500) return { error: "note is too long (500 characters max)." };

  if (!Array.isArray(raw.items) || raw.items.length === 0) return { error: "A bill needs at least one item." };
  if (raw.items.length > MAX_LINES) return { error: `A bill cannot have more than ${MAX_LINES} items.` };

  const items: BillLine[] = [];
  for (const [i, line] of raw.items.entries()) {
    const at = `Item ${i + 1}`;
    if (!line || typeof line !== "object") return { error: `${at} is not an item.` };

    const name = str(line.name);
    if (!name) return { error: `${at} needs a name.` };
    if (name.length > 120) return { error: `${at}: name is too long (120 characters max).` };

    const unit = str(line.unit) || "pc";
    if (unit.length > 20) return { error: `${at}: unit is too long (20 characters max).` };

    const qty = num(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { error: `${at}: quantity must be greater than zero.` };

    const cost = num(line.cost);
    if (!Number.isFinite(cost) || cost < 0) return { error: `${at}: cost must be zero or more.` };

    const priced = unitPrice(qty, unit, cost);
    if (!priced) return { error: `${at}: could not work out a price per ${unit}.` };

    const itemId = str(line.itemId) || null;
    const category = str(line.category) || null;
    if (itemId && itemId.length > 60) return { error: `${at}: itemId is too long.` };
    if (category && category.length > 80) return { error: `${at}: category is too long.` };

    items.push({
      name,
      key: itemKey(name),
      itemId,
      category,
      qty,
      unit,
      cost: round(cost),
      base: priced.base,
      baseQty: priced.baseQty,
      unitPrice: priced.price,
    });
  }

  return {
    bill: {
      date: raw.date!,
      store,
      note,
      total: round(items.reduce((t, i) => t + i.cost, 0)),
      items,
    },
  };
}

export const MAX_IMPORT = 100;

/**
 * Validate one bill, or a whole import of them. An import is all-or-nothing:
 * one bad line rejects the batch rather than leaving half of it in the
 * database, since there is no route to delete a bill again.
 */
export function normalizeBills(input: unknown): { bills: Bill[] } | { error: string } {
  if (!Array.isArray(input)) {
    const one = normalizeBill(input);
    return "error" in one ? one : { bills: [one.bill] };
  }
  if (input.length === 0) return { error: "That file has no bills in it." };
  if (input.length > MAX_IMPORT) return { error: `No more than ${MAX_IMPORT} bills in one import.` };

  const bills: Bill[] = [];
  for (const [i, entry] of input.entries()) {
    const one = normalizeBill(entry);
    if ("error" in one) return { error: `Bill ${i + 1} of ${input.length}: ${one.error}` };
    bills.push(one.bill);
  }
  return { bills };
}

/**
 * The shape the importer accepts, as a copyable example. `itemId` and
 * `category` are optional — fill them in from the inventory to tie a purchase
 * to an item, or leave them out and the name alone will match.
 */
export const SAMPLE_BILLS = (date = "2026-10-01") => [
  {
    date,
    store: "Reliance Fresh",
    note: "optional",
    items: [
      { name: "Toor dal", qty: 1, unit: "kg", cost: 189.5, itemId: "g1", category: "Groceries" },
      { name: "Tea leaves", qty: 250, unit: "g", cost: 132, itemId: "g5", category: "Groceries" },
      { name: "Dish soap bar", qty: 3, unit: "pcs", cost: 66 },
    ],
  },
  {
    date,
    store: "Local kirana",
    items: [{ name: "Mustard oil", qty: 1, unit: "L", cost: 192 }],
  },
];

/**
 * The date is a parameter rather than today(): this is rendered inside a
 * prerendered client component, and reading the clock there is an error under
 * cacheComponents. The page passes its own (deferred) bill date in.
 */
export const sampleJson = (date?: string) => JSON.stringify(SAMPLE_BILLS(date), null, 2);

export type PriceRef = { name: string; base: string; last: number; lastDate: string; best: number; avg: number; points: number };

/** How this purchase compares with what the item has cost before. */
export function compareWithHistory(line: { base: string; unitPrice: number }, ref: PriceRef | undefined) {
  if (!ref || ref.base !== line.base) return { verdict: "new" as const, ref: null };
  const vsBest = ((line.unitPrice - ref.best) / ref.best) * 100;
  const vsLast = ((line.unitPrice - ref.last) / ref.last) * 100;
  // Within half a percent of the best price ever counts as matching it.
  const verdict = vsBest <= 0.5 ? ("best" as const) : vsLast <= -0.5 ? ("cheaper" as const) : vsLast >= 0.5 ? ("pricier" as const) : ("same" as const);
  return { verdict, ref, vsBest: Math.round(vsBest * 10) / 10, vsLast: Math.round(vsLast * 10) / 10 };
}
