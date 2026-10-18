export type Item = {
  id: string;
  name: string;
  /** Where it physically lives. Optional, free text. */
  room: string;
  qty: number;
  unit: string;
  min: number;
  /** Free-text labels for grouping spend on the analytics page. */
  tags?: string[];
  /** Other names on bills that should map to this item (e.g. brand names). */
  aliases?: string[];
  /** Case-insensitive regexes tested against the line name when aliases are not enough. */
  patterns?: string[];
};

export type Category = {
  id: string;
  name: string;
  items: Item[];
};

export type Inventory = { categories: Category[] };

export const isLow = (item: Item) => item.qty <= item.min;

/** Items at or below their minimum, flattened with their category. */
export const lowStock = (inv: Inventory) =>
  inv.categories.flatMap((cat) =>
    cat.items.filter(isLow).map((item) => ({ ...item, category: cat.name, categoryId: cat.id })),
  );

export const totals = (inv: Inventory) => {
  const items = inv.categories.flatMap((c) => c.items);
  return {
    categories: inv.categories.length,
    items: items.length,
    low: items.filter(isLow).length,
    out: items.filter((i) => i.qty === 0).length,
  };
};

export const newId = () => Math.random().toString(36).slice(2, 9);

/** Every tag in use, for the tag picker's suggestions. */
export const allTags = (inv: Inventory) =>
  [...new Set(inv.categories.flatMap((c) => c.items.flatMap((i) => i.tags ?? [])))].sort();

/** itemId -> tags, so purchases can be grouped by tag on the analytics page. */
export const tagIndex = (inv: Inventory) =>
  new Map(inv.categories.flatMap((c) => c.items.map((i) => [i.id, i.tags ?? []] as const)));

/**
 * Tags are short, lowercase, deduped and capped — they are axis labels, not
 * notes. A comma is the separator between tags, so it is never part of one.
 */
export const cleanTag = (raw: string) =>
  raw.replace(/,/g, " ").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 24);

export const MAX_TAGS = 8;

/** Adds one tag, or several when the input is comma-separated. */
export const addTag = (tags: string[] | undefined, raw: string) => {
  let next = tags ?? [];
  for (const part of raw.split(",")) {
    const tag = cleanTag(part);
    if (!tag || next.includes(tag) || next.length >= MAX_TAGS) continue;
    next = [...next, tag];
  }
  return next;
};

export const MAX_CATEGORIES = 50;
export const MAX_ITEMS = 500;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function cleanStringList(raw: unknown, max: number, maxLen: number, label: string): string[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return `${label} must be a list.`;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const s = text(entry);
    if (!s) continue;
    if (s.length > maxLen) return `${label} is too long (${maxLen} characters max).`;
    const key = s.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length > max) return `${label}: no more than ${max}.`;
  }
  return out;
}

function cleanPatternList(raw: unknown, max: number, maxLen: number, label: string): string[] | string {
  const list = cleanStringList(raw, max, maxLen, label);
  if (typeof list === "string") return list;
  for (const p of list) {
    try {
      new RegExp(p, "i");
    } catch {
      return `${label} "${p}" is not a valid regex.`;
    }
  }
  return list;
}

/**
 * Validate and normalise a whole inventory document. This is the only gate in
 * front of the database, so every field is checked here.
 *
 * Names are allowed to be empty: the UI saves on each keystroke, so clearing a
 * name field must not be rejected. Ids may not be — they key the stored
 * documents and the React rows.
 */
export function normalizeInventory(input: unknown): { inventory: Inventory } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected an inventory object." };
  const raw = (input as { categories?: unknown }).categories;
  if (!Array.isArray(raw)) return { error: "Expected { categories: [...] }." };
  if (raw.length > MAX_CATEGORIES) return { error: `No more than ${MAX_CATEGORIES} categories.` };

  const categories: Category[] = [];
  const seenCategories = new Set<string>();

  for (const [c, entry] of raw.entries()) {
    const at = `Category ${c + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not a category.` };
    const cat = entry as Partial<Category>;

    const id = text(cat.id);
    if (!id) return { error: `${at} has no id.` };
    if (id.length > 60) return { error: `${at}: id is too long.` };
    if (seenCategories.has(id)) return { error: `${at}: duplicate id "${id}".` };
    seenCategories.add(id);

    const name = text(cat.name);
    if (name.length > 80) return { error: `${at}: name is too long (80 characters max).` };

    if (!Array.isArray(cat.items)) return { error: `${at}: items must be a list.` };
    if (cat.items.length > MAX_ITEMS) return { error: `${at}: no more than ${MAX_ITEMS} items.` };

    const items: Item[] = [];
    const seenItems = new Set<string>();

    for (const [i, entryItem] of cat.items.entries()) {
      const where = `${at}, item ${i + 1}`;
      if (!entryItem || typeof entryItem !== "object") return { error: `${where} is not an item.` };
      const item = entryItem as Partial<Item>;

      const itemId = text(item.id);
      if (!itemId) return { error: `${where} has no id.` };
      if (itemId.length > 60) return { error: `${where}: id is too long.` };
      if (seenItems.has(itemId)) return { error: `${where}: duplicate id "${itemId}".` };
      seenItems.add(itemId);

      const itemName = text(item.name);
      if (itemName.length > 120) return { error: `${where}: name is too long (120 characters max).` };
      const room = text(item.room);
      if (room.length > 60) return { error: `${where}: room is too long (60 characters max).` };
      const unit = text(item.unit);
      if (unit.length > 20) return { error: `${where}: unit is too long (20 characters max).` };

      const qty = Number(item.qty);
      const min = Number(item.min);
      if (!Number.isFinite(qty) || qty < 0) return { error: `${where}: quantity must be zero or more.` };
      if (!Number.isFinite(min) || min < 0) return { error: `${where}: minimum must be zero or more.` };

      if (item.tags !== undefined && !Array.isArray(item.tags)) return { error: `${where}: tags must be a list.` };
      const tags = (item.tags ?? [])
        .map((t) => cleanTag(String(t)))
        .filter((t, at2, all) => t && all.indexOf(t) === at2)
        .slice(0, MAX_TAGS);

      const aliases = cleanStringList(item.aliases, 20, 120, `${where}: alias`);
      if (typeof aliases === "string") return { error: aliases };

      const patterns = cleanPatternList(item.patterns, 5, 80, `${where}: pattern`);
      if (typeof patterns === "string") return { error: patterns };

      items.push({
        id: itemId,
        name: itemName,
        room,
        qty,
        unit,
        min,
        ...(tags.length ? { tags } : {}),
        ...(aliases.length ? { aliases } : {}),
        ...(patterns.length ? { patterns } : {}),
      });
    }

    categories.push({ id, name, items });
  }

  return { inventory: { categories } };
}
