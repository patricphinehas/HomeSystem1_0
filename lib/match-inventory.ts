import { itemKey } from "./analytics.ts";
import type { BillInput } from "./bill.ts";
import type { Inventory, Item } from "./inventory.ts";

export type InventoryHit = {
  itemId: string;
  category: string;
  itemName: string;
  via: "id" | "name" | "alias" | "pattern";
};

const tryPattern = (name: string, pattern: string) => {
  try {
    return new RegExp(pattern, "i").test(name);
  } catch {
    return false;
  }
};

/** Match a purchase line name to an inventory item (name, alias, or regex pattern). */
export function matchInventoryLine(
  name: string,
  inv: Inventory,
  explicitItemId?: string | null,
): InventoryHit | null {
  if (explicitItemId) {
    for (const cat of inv.categories) {
      const item = cat.items.find((i) => i.id === explicitItemId);
      if (item) return { itemId: item.id, category: cat.name, itemName: item.name, via: "id" };
    }
  }

  const key = itemKey(name);
  if (!key) return null;

  for (const cat of inv.categories) {
    for (const item of cat.items) {
      if (itemKey(item.name) === key) {
        return { itemId: item.id, category: cat.name, itemName: item.name, via: "name" };
      }
      for (const alias of item.aliases ?? []) {
        const ak = itemKey(alias);
        if (ak && (key === ak || key.includes(ak))) {
          return { itemId: item.id, category: cat.name, itemName: item.name, via: "alias" };
        }
      }
    }
  }

  for (const cat of inv.categories) {
    for (const item of cat.items) {
      for (const pattern of item.patterns ?? []) {
        if (tryPattern(name, pattern)) {
          return { itemId: item.id, category: cat.name, itemName: item.name, via: "pattern" };
        }
      }
    }
  }

  return null;
}

export function applyInventoryMatch(bills: BillInput[], inv: Inventory): BillInput[] {
  return bills.map((bill) => ({
    ...bill,
    items: bill.items.map((line) => {
      const hit = matchInventoryLine(line.name, inv, line.itemId);
      if (!hit) return { ...line, itemId: line.itemId ?? null, category: line.category ?? null };
      return { ...line, itemId: hit.itemId, category: hit.category };
    }),
  }));
}

export type UnmatchedLine = { billIndex: number; itemIndex: number; name: string };

/** Lines with no inventory link after auto-match (grouped by normalised name). */
export function unmatchedImportLines(bills: BillInput[], inv: Inventory): Map<string, UnmatchedLine[]> {
  const auto = applyInventoryMatch(bills, inv);
  const groups = new Map<string, UnmatchedLine[]>();
  auto.forEach((bill, billIndex) => {
    bill.items.forEach((line, itemIndex) => {
      if (line.itemId) return;
      const key = itemKey(line.name);
      if (!key) return;
      groups.set(key, [...(groups.get(key) ?? []), { billIndex, itemIndex, name: line.name }]);
    });
  });
  return groups;
}

export function applyImportMapping(
  bills: BillInput[],
  inv: Inventory,
  pick: Map<string, { itemId: string | null; category: string | null }>,
): BillInput[] {
  return bills.map((bill, billIndex) => ({
    ...bill,
    items: bill.items.map((line, itemIndex) => {
      const key = itemKey(line.name);
      const chosen = key ? pick.get(key) : undefined;
      if (chosen) {
        return { ...line, itemId: chosen.itemId, category: chosen.category };
      }
      const hit = matchInventoryLine(line.name, inv, line.itemId);
      if (hit) return { ...line, itemId: hit.itemId, category: hit.category };
      return { ...line, itemId: null, category: null };
    }),
  }));
}

/** Add an alias on one item (deduped by itemKey). Returns a new inventory document. */
export function addItemAlias(inv: Inventory, itemId: string, alias: string): Inventory {
  const key = itemKey(alias);
  if (!key) return inv;
  return {
    categories: inv.categories.map((cat) => ({
      ...cat,
      items: cat.items.map((item) => {
        if (item.id !== itemId) return item;
        const aliases = [...(item.aliases ?? [])];
        if (aliases.some((a) => itemKey(a) === key)) return item;
        return { ...item, aliases: [...aliases, alias.trim()] };
      }),
    })),
  };
}

export function allInventoryItems(inv: Inventory): { item: Item; category: string; categoryId: string }[] {
  return inv.categories.flatMap((cat) => cat.items.map((item) => ({ item, category: cat.name, categoryId: cat.id })));
}
