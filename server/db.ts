/**
 * Supabase (Postgres) connection and the queries behind the API.
 *
 * Everything the routes need is in here, so server/index.ts stays transport and
 * lib/ stays pure. The tables are defined in supabase/schema.sql.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import type { Bill, BillLine, StoredBill } from "../lib/bill.ts";
import type { Category, Inventory, Item } from "../lib/inventory.ts";
import type { Line } from "../lib/analytics.ts";

const CONNECTION = process.env.DATABASE_URL ?? "";

/** Reported by the API and by `doctor`, with the password never echoed. */
export const describeTarget = () => {
  if (!CONNECTION) return "DATABASE_URL is not set";
  try {
    const u = new URL(CONNECTION);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "DATABASE_URL is not a valid connection string";
  }
};

export class NotConfigured extends Error {
  constructor() {
    super("DATABASE_URL is not set. Copy .env.example to .env and paste the Supabase connection string.");
    this.name = "NotConfigured";
  }
}

let client: postgres.Sql | null = null;

export const sql = (): postgres.Sql => {
  if (!CONNECTION) throw new NotConfigured();
  // Supabase requires TLS; its pooler presents a certificate the default
  // verification rejects, which is why the hosted docs use sslmode=require.
  client ??= postgres(CONNECTION, { ssl: "require", max: 4, idle_timeout: 20, connect_timeout: 10 });
  return client;
};

export const applySchema = async () => {
  const file = new URL("../supabase/schema.sql", import.meta.url);
  await sql().unsafe(readFileSync(file, "utf8"));
};

/* ---------------- inventory ---------------- */

type ItemRow = {
  id: string;
  category_id: string;
  name: string;
  room: string;
  qty: string;
  unit: string;
  min: string;
  tags: string[];
};

export async function readInventory(): Promise<Inventory> {
  const db = sql();
  const [categories, items] = await Promise.all([
    db<{ id: string; name: string }[]>`select id, name from categories order by position, id`,
    db<ItemRow[]>`select id, category_id, name, room, qty, unit, min, tags from items order by category_id, position, id`,
  ]);

  const byCategory = new Map<string, Item[]>();
  for (const row of items) {
    const item: Item = {
      id: row.id,
      name: row.name,
      room: row.room,
      qty: Number(row.qty),
      unit: row.unit,
      min: Number(row.min),
      ...(row.tags.length ? { tags: row.tags } : {}),
    };
    byCategory.set(row.category_id, [...(byCategory.get(row.category_id) ?? []), item]);
  }

  return {
    categories: categories.map<Category>((c) => ({ id: c.id, name: c.name, items: byCategory.get(c.id) ?? [] })),
  };
}

/**
 * Replace the whole inventory in one transaction: upsert every category and
 * item that was sent, with their positions, then delete whatever is no longer
 * there. A failure part-way rolls the lot back.
 *
 * ponytail: whole-document replace, last writer wins. Fine for one household;
 * split into per-item routes if this ever gets concurrent editors.
 */
export async function writeInventory(inventory: Inventory): Promise<void> {
  await sql().begin(async (tx) => {
    const categoryIds = inventory.categories.map((c) => c.id);
    const itemIds = inventory.categories.flatMap((c) => c.items.map((i) => i.id));

    for (const [position, category] of inventory.categories.entries()) {
      await tx`
        insert into categories ${tx({ id: category.id, name: category.name, position })}
        on conflict (id) do update set name = excluded.name, position = excluded.position
      `;
    }

    // Items go after their categories so the foreign key is always satisfied.
    for (const category of inventory.categories) {
      for (const [position, item] of category.items.entries()) {
        await tx`
          insert into items ${tx({
            id: item.id,
            category_id: category.id,
            name: item.name,
            room: item.room,
            qty: item.qty,
            unit: item.unit,
            min: item.min,
            tags: item.tags ?? [],
            position,
          })}
          on conflict (id) do update set
            category_id = excluded.category_id,
            name = excluded.name,
            room = excluded.room,
            qty = excluded.qty,
            unit = excluded.unit,
            min = excluded.min,
            tags = excluded.tags,
            position = excluded.position
        `;
      }
    }

    await tx`delete from items ${itemIds.length ? tx`where id <> all(${itemIds})` : tx``}`;
    await tx`delete from categories ${categoryIds.length ? tx`where id <> all(${categoryIds})` : tx``}`;
  });
}

/* ---------------- bills ---------------- */

export async function insertBills(bills: Bill[]): Promise<string[]> {
  return sql().begin(async (tx) => {
    const ids: string[] = [];
    for (const bill of bills) {
      const [row] = await tx<{ id: string }[]>`
        insert into bills ${tx({ date: bill.date, store: bill.store, note: bill.note, total: bill.total })}
        returning id
      `;
      ids.push(row.id);
      await tx`
        insert into bill_items ${tx(
          bill.items.map((item) => ({
            bill_id: row.id,
            name: item.name,
            key: item.key,
            item_id: item.itemId,
            category: item.category,
            qty: item.qty,
            unit: item.unit,
            cost: item.cost,
            base: item.base,
            base_qty: item.baseQty,
            unit_price: item.unitPrice,
          })),
        )}
      `;
    }
    return ids;
  });
}

type LineRow = {
  bill_id: string;
  date: string;
  store: string;
  note: string;
  total: string;
  created_at: Date;
  name: string;
  key: string;
  item_id: string | null;
  category: string | null;
  qty: string;
  unit: string;
  cost: string;
  base: string;
  base_qty: string;
  unit_price: string;
};

const toLine = (row: LineRow): Line => ({
  billId: row.bill_id,
  date: row.date,
  store: row.store,
  name: row.name,
  key: row.key,
  itemId: row.item_id,
  category: row.category,
  qty: Number(row.qty),
  unit: row.unit,
  cost: Number(row.cost),
  base: row.base,
  baseQty: Number(row.base_qty),
  unitPrice: Number(row.unit_price),
});

/**
 * Every purchase line, oldest first — the input to all of lib/analytics.
 *
 * One scan per request, which is the right trade at household scale (a decade
 * of weekly bills is a few thousand rows) and keeps the maths in one tested
 * place instead of in SQL. If it ever gets slow, cache the payload and
 * invalidate it on insert.
 */
export async function readLines(): Promise<Line[]> {
  const rows = await sql()<LineRow[]>`
    select b.id as bill_id, to_char(b.date, 'YYYY-MM-DD') as date, b.store,
           i.name, i.key, i.item_id, i.category, i.qty, i.unit, i.cost,
           i.base, i.base_qty, i.unit_price
    from bill_items i
    join bills b on b.id = i.bill_id
    order by b.date, b.created_at, i.id
  `;
  return rows.map(toLine);
}

export async function readBills(limit: number): Promise<StoredBill[]> {
  const db = sql();
  const bills = await db<{ id: string; date: string; store: string; note: string; total: string; created_at: Date }[]>`
    select id, to_char(date, 'YYYY-MM-DD') as date, store, note, total, created_at
    from bills order by date desc, created_at desc limit ${limit}
  `;
  if (bills.length === 0) return [];

  const items = await db<(LineRow & { bill_id: string })[]>`
    select bill_id, name, key, item_id, category, qty, unit, cost, base, base_qty, unit_price
    from bill_items where bill_id = any(${bills.map((b) => b.id)}) order by id
  `;

  const byBill = new Map<string, BillLine[]>();
  for (const row of items) {
    const line = toLine({ ...row, date: "", store: "" } as LineRow);
    const { billId: _billId, date: _date, store: _store, ...rest } = line;
    byBill.set(row.bill_id, [...(byBill.get(row.bill_id) ?? []), rest]);
  }

  return bills.map((b) => ({
    id: b.id,
    date: b.date,
    store: b.store,
    note: b.note,
    total: Number(b.total),
    createdAt: b.created_at.toISOString(),
    items: byBill.get(b.id) ?? [],
  }));
}

/** Empties every table. Used only by `seed --clear`. */
export async function clear(): Promise<void> {
  // bill_items and items go with their parents through the cascade.
  await sql()`truncate bills, categories cascade`;
}

export async function counts(): Promise<{ categories: number; items: number; bills: number }> {
  const [row] = await sql()<{ categories: string; items: string; bills: string }[]>`
    select (select count(*) from categories) as categories,
           (select count(*) from items) as items,
           (select count(*) from bills) as bills
  `;
  return { categories: Number(row.categories), items: Number(row.items), bills: Number(row.bills) };
}

export const close = async () => {
  await client?.end({ timeout: 5 });
  client = null;
};
