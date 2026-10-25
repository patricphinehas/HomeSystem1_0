/**
 * SQLite connection and the queries behind the API.
 * Used when DB_SELECT=sqlite. The tables are defined in sqlite/schema.sql.
 *
 * This is the option that makes the app standalone: no server to run, no
 * account to make, no network to be reachable. One file on disk, named by
 * `SQLITE_PATH` (default `data/homesystem.db`), through Node's built-in
 * `node:sqlite` — so it costs no dependency either.
 *
 * Two things follow from the engine being synchronous. Every function here is
 * still `async`, because `server/db.ts` promises that shape to callers, and a
 * transaction is a plain `begin` / `commit` around synchronous statements,
 * which is both simpler and stricter than the other two drivers: nothing can
 * interleave inside one.
 *
 * SQLite has no array or JSON column type, so the places Postgres uses
 * `text[]` or `jsonb` hold JSON text here and are read and written whole. That
 * is exactly how the app already treats them — tags, modes, people, an RSVP
 * map and a comment thread are never queried into — so nothing is lost.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Bill, BillLine, StoredBill } from "../lib/bill.ts";
import type { Category, Inventory, Item } from "../lib/inventory.ts";
import type { Subscription, SubscriptionsDoc } from "../lib/subscriptions.ts";
import { fromStored } from "../lib/calendar.ts";
import type { CalendarDoc } from "../lib/calendar.ts";
import { normalizeDevices } from "../lib/devices.ts";
import type { DevicesDoc } from "../lib/devices.ts";
import type { FamilyDoc } from "../lib/family.ts";
import type { ChatDay, LoggedMessage } from "../lib/chat-log.ts";
import type { Line } from "../lib/analytics.ts";
import { sqliteSchemaFile } from "./paths.ts";

/**
 * Where the file is, read when it is needed rather than when this module is
 * imported. A desktop build sets SQLITE_PATH after its own process has started
 * and before the first query, and reading it once at import time would quietly
 * use the repo default instead.
 */
const wanted = () => resolve(process.env.SQLITE_PATH?.trim() || "data/homesystem.db");

let db: DatabaseSync | null = null;
let openedFile = "";

/**
 * Reported by the API and by `doctor`: the file that is actually open, or the
 * one that would be opened next. A path, with nothing secret in it.
 */
export const describeTarget = () => openedFile || wanted();

/**
 * Opens the file on first use, creating its directory if it is not there, and
 * applies the schema. A SQLite database that does not exist yet is an empty
 * one rather than an error, so `migrate` is genuinely optional here — but it
 * still works, and still prints what it found.
 */
const open = (): DatabaseSync => {
  if (db) return db;
  const file = wanted();
  mkdirSync(dirname(file), { recursive: true });
  const opened = new DatabaseSync(file);
  // Write-ahead logging, so the pages reading while a bill is being written do
  // not block on it. Foreign keys are off by default in SQLite, which would
  // quietly skip every `on delete cascade` in the schema.
  opened.exec("pragma journal_mode = wal");
  opened.exec("pragma foreign_keys = on");
  opened.exec("pragma busy_timeout = 4000");
  opened.exec(readFileSync(sqliteSchemaFile(), "utf8"));
  db = opened;
  openedFile = file;
  return opened;
};

/** One transaction. A throw rolls back, so a half-applied write cannot land. */
function tx<T>(work: (handle: DatabaseSync) => T): T {
  const handle = open();
  handle.exec("begin immediate");
  try {
    const result = work(handle);
    handle.exec("commit");
    return result;
  } catch (error) {
    handle.exec("rollback");
    throw error;
  }
}

const all = <T>(statement: string, ...params: (string | number | null)[]): T[] =>
  open().prepare(statement).all(...params) as T[];

const list = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
};

/** A JSON column, parsed defensively: a hand-edited file is still readable. */
const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const bool = (value: unknown) => value === 1 || value === true;

export const applySchema = async () => {
  open();
};

export async function serverInfo(): Promise<string> {
  const [row] = all<{ v: string }>("select sqlite_version() as v");
  return `SQLite ${row.v}`;
}

/* ---------------- inventory ---------------- */

type ItemRow = {
  id: string;
  category_id: string;
  name: string;
  room: string;
  qty: number;
  unit: string;
  min: number;
  tags: string;
  aliases: string;
  patterns: string;
};

export async function readInventory(): Promise<Inventory> {
  const categories = all<{ id: string; name: string }>("select id, name from categories order by position, id");
  const items = all<ItemRow>(
    `select id, category_id, name, room, qty, unit, min, tags, aliases, patterns
     from items order by category_id, position, id`,
  );

  const byCategory = new Map<string, Item[]>();
  for (const row of items) {
    const tags = list(json(row.tags, []));
    const aliases = list(json(row.aliases, []));
    const patterns = list(json(row.patterns, []));
    const item: Item = {
      id: row.id,
      name: row.name,
      room: row.room,
      qty: Number(row.qty),
      unit: row.unit,
      min: Number(row.min),
      ...(tags.length ? { tags } : {}),
      ...(aliases.length ? { aliases } : {}),
      ...(patterns.length ? { patterns } : {}),
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
 * there.
 *
 * ponytail: whole-document replace, last writer wins. Fine for one household;
 * split into per-item routes if this ever gets concurrent editors.
 */
export async function writeInventory(inventory: Inventory): Promise<void> {
  tx((handle) => {
    const category = handle.prepare(
      `insert into categories (id, name, position) values (?, ?, ?)
       on conflict (id) do update set name = excluded.name, position = excluded.position`,
    );
    const item = handle.prepare(
      `insert into items (id, category_id, name, room, qty, unit, min, tags, aliases, patterns, position)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set
         category_id = excluded.category_id, name = excluded.name, room = excluded.room,
         qty = excluded.qty, unit = excluded.unit, min = excluded.min, tags = excluded.tags,
         aliases = excluded.aliases, patterns = excluded.patterns, position = excluded.position`,
    );

    const itemIds: string[] = [];
    inventory.categories.forEach((cat, position) => {
      category.run(cat.id, cat.name, position);
      cat.items.forEach((row, itemPosition) => {
        itemIds.push(row.id);
        item.run(
          row.id,
          cat.id,
          row.name,
          row.room,
          row.qty,
          row.unit,
          row.min,
          JSON.stringify(row.tags ?? []),
          JSON.stringify(row.aliases ?? []),
          JSON.stringify(row.patterns ?? []),
          itemPosition,
        );
      });
    });

    // Items first, then categories: dropping a category cascades to its items,
    // and the items that are staying must not go with it.
    prune(handle, "items", itemIds);
    prune(handle, "categories", inventory.categories.map((c) => c.id));
  });
}

/**
 * Delete every row of a table whose id is not in `keep` — the "then delete
 * whatever is no longer there" half of every whole-document write.
 *
 * SQLite has no array parameter, so the statement grows one placeholder per
 * id. The ids are still bound, never interpolated: `delete from items where id
 * not in (?, ?, ?)`. The table name is from this file's own call sites and
 * never from a payload.
 */
function prune(handle: DatabaseSync, table: string, keep: string[]): void {
  if (keep.length === 0) {
    handle.exec(`delete from ${table}`);
    return;
  }
  const holes = keep.map(() => "?").join(", ");
  handle.prepare(`delete from ${table} where id not in (${holes})`).run(...keep);
}

/* ---------------- subscriptions ---------------- */

type SubscriptionRow = {
  id: string;
  name: string;
  type: string;
  tag: string;
  holder: string;
  shareable: number;
  share_count: number | null;
  cost: number | null;
  cycle: string | null;
};

export async function readSubscriptions(): Promise<SubscriptionsDoc> {
  const rows = all<SubscriptionRow>(
    `select id, name, type, tag, holder, shareable, share_count, cost, cycle
     from subscriptions order by position, id`,
  );
  return {
    subscriptions: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      tag: r.tag,
      holder: r.holder,
      shareable: bool(r.shareable),
      shareCount: r.share_count,
      // Rows written before the columns existed read as a free monthly one.
      cost: Number(r.cost ?? 0),
      cycle: (r.cycle || "monthly") as Subscription["cycle"],
    })),
  };
}

export async function writeSubscriptions(doc: SubscriptionsDoc): Promise<void> {
  tx((handle) => {
    const write = handle.prepare(
      `insert into subscriptions (id, name, type, tag, holder, shareable, share_count, cost, cycle, position)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set
         name = excluded.name, type = excluded.type, tag = excluded.tag, holder = excluded.holder,
         shareable = excluded.shareable, share_count = excluded.share_count, cost = excluded.cost,
         cycle = excluded.cycle, position = excluded.position`,
    );
    doc.subscriptions.forEach((sub, position) => {
      write.run(
        sub.id,
        sub.name,
        sub.type,
        sub.tag,
        sub.holder,
        sub.shareable ? 1 : 0,
        sub.shareCount ?? null,
        sub.cost,
        sub.cycle,
        position,
      );
    });
    prune(handle, "subscriptions", doc.subscriptions.map((s) => s.id));
  });
}

/* ---------------- chat log ---------------- */

export async function readChatDays(): Promise<ChatDay[]> {
  const rows = all<{ day: string; messages: string }>("select day, messages from chats order by day desc");
  return rows.map((r) => ({ date: r.day, messages: json<LoggedMessage[]>(r.messages, []) }));
}

export async function writeChatDay(day: ChatDay): Promise<void> {
  open()
    .prepare(
      `insert into chats (day, messages) values (?, ?)
       on conflict (day) do update set messages = excluded.messages`,
    )
    .run(day.date, JSON.stringify(day.messages));
}

/* ---------------- family ---------------- */

export async function readFamily(): Promise<FamilyDoc> {
  return { people: all<{ id: string; name: string; role: string }>("select id, name, role from family order by position, id") };
}

export async function writeFamily(doc: FamilyDoc): Promise<void> {
  tx((handle) => {
    const write = handle.prepare(
      `insert into family (id, name, role, position) values (?, ?, ?, ?)
       on conflict (id) do update set name = excluded.name, role = excluded.role, position = excluded.position`,
    );
    doc.people.forEach((person, position) => write.run(person.id, person.name, person.role, position));
    prune(handle, "family", doc.people.map((p) => p.id));
  });
}

/* ---------------- smart home ---------------- */

type ControllerRow = { id: string; name: string; url: string; token_env: string; notes: string };

type DeviceRow = {
  id: string;
  name: string;
  kind: string;
  room: string;
  controller_id: string | null;
  address: string;
  min_setpoint: number | null;
  max_setpoint: number | null;
  modes: string;
  read_only: number;
};

/**
 * Both tables in one read: the registry is only ever useful whole, because a
 * device without its controller's address cannot be reached.
 */
export async function readDevices(): Promise<DevicesDoc> {
  const controllers = all<ControllerRow>("select id, name, url, token_env, notes from controllers order by position, id");
  const devices = all<DeviceRow>(
    `select id, name, kind, room, controller_id, address, min_setpoint, max_setpoint, modes, read_only
     from devices order by position, id`,
  );
  // Through the app's own validator, so a row written by hand or by an older
  // version still arrives with every key the pages expect.
  const result = normalizeDevices({
    controllers: controllers.map((r) => ({ ...r, tokenEnv: r.token_env })),
    devices: devices.map((r) => ({
      ...r,
      controller: r.controller_id ?? "",
      minSetpoint: r.min_setpoint === null ? null : Number(r.min_setpoint),
      maxSetpoint: r.max_setpoint === null ? null : Number(r.max_setpoint),
      modes: list(json(r.modes, [])),
      readOnly: bool(r.read_only),
    })),
  });
  if ("error" in result) throw new Error(`The stored devices are not readable: ${result.error}`);
  return result.doc;
}

export async function writeDevices(doc: DevicesDoc): Promise<void> {
  tx((handle) => {
    const controller = handle.prepare(
      `insert into controllers (id, name, url, token_env, notes, position) values (?, ?, ?, ?, ?, ?)
       on conflict (id) do update set
         name = excluded.name, url = excluded.url, token_env = excluded.token_env,
         notes = excluded.notes, position = excluded.position`,
    );
    doc.controllers.forEach((row, position) =>
      controller.run(row.id, row.name, row.url, row.tokenEnv, row.notes, position),
    );

    const device = handle.prepare(
      `insert into devices
         (id, name, kind, room, controller_id, address, min_setpoint, max_setpoint, modes, read_only, position)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set
         name = excluded.name, kind = excluded.kind, room = excluded.room,
         controller_id = excluded.controller_id, address = excluded.address,
         min_setpoint = excluded.min_setpoint, max_setpoint = excluded.max_setpoint,
         modes = excluded.modes, read_only = excluded.read_only, position = excluded.position`,
    );
    doc.devices.forEach((row, position) =>
      device.run(
        row.id,
        row.name,
        row.kind,
        row.room,
        row.controller || null,
        row.address,
        row.minSetpoint,
        row.maxSetpoint,
        JSON.stringify(row.modes ?? []),
        row.readOnly ? 1 : 0,
        position,
      ),
    );

    // Devices first: dropping a controller cascades, and the devices that are
    // staying must not be taken with it.
    prune(handle, "devices", doc.devices.map((d) => d.id));
    prune(handle, "controllers", doc.controllers.map((c) => c.id));
  });
}

/* ---------------- calendar ---------------- */

type EventRow = {
  id: string;
  on_date: string;
  at_time: string;
  end_time: string;
  kind: string;
  title: string;
  venue: string;
  link: string;
  people: string;
  rsvp: string;
  reservation: string;
  reserved_under: string;
  created_by: string;
  notes: string;
  comments: string;
};

export async function readCalendar(): Promise<CalendarDoc> {
  const rows = all<EventRow>(
    `select id, on_date, at_time, end_time, kind, title, venue, link, people, rsvp,
            reservation, reserved_under, created_by, notes, comments
     from events order by on_date, at_time, title`,
  );
  // Through `fromStored`, so a row written before a column existed still
  // arrives with every key, exactly as the other two drivers do.
  return {
    events: rows.map((r) =>
      fromStored({
        ...r,
        date: r.on_date,
        time: r.at_time,
        endTime: r.end_time,
        people: json(r.people, []),
        rsvp: json(r.rsvp, {}),
        reservedUnder: r.reserved_under,
        createdBy: r.created_by,
        comments: json(r.comments, []),
      }),
    ),
  };
}

export async function writeCalendar(doc: CalendarDoc): Promise<void> {
  tx((handle) => {
    const write = handle.prepare(
      `insert into events
         (id, on_date, at_time, end_time, kind, title, venue, link, people, rsvp,
          reservation, reserved_under, created_by, notes, comments)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set
         on_date = excluded.on_date, at_time = excluded.at_time, end_time = excluded.end_time,
         kind = excluded.kind, title = excluded.title, venue = excluded.venue, link = excluded.link,
         people = excluded.people, rsvp = excluded.rsvp, reservation = excluded.reservation,
         reserved_under = excluded.reserved_under, created_by = excluded.created_by,
         notes = excluded.notes, comments = excluded.comments`,
    );
    for (const event of doc.events) {
      write.run(
        event.id,
        event.date,
        event.time,
        event.endTime,
        event.kind,
        event.title,
        event.venue,
        event.link,
        JSON.stringify(event.people),
        JSON.stringify(event.rsvp),
        event.reservation,
        event.reservedUnder,
        event.createdBy,
        event.notes,
        JSON.stringify(event.comments),
      );
    }
    prune(handle, "events", doc.events.map((e) => e.id));
  });
}

/* ---------------- bills ---------------- */

export async function insertBills(bills: Bill[]): Promise<string[]> {
  return tx((handle) => {
    const bill = handle.prepare(
      "insert into bills (id, date, store, note, total, created_at) values (?, ?, ?, ?, ?, ?)",
    );
    const line = handle.prepare(
      `insert into bill_items
         (bill_id, name, key, item_id, category, qty, unit, cost, base, base_qty, unit_price)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ids: string[] = [];
    for (const row of bills) {
      const id = crypto.randomUUID();
      ids.push(id);
      bill.run(id, row.date, row.store, row.note, row.total, new Date().toISOString());
      for (const item of row.items) {
        line.run(
          id,
          item.name,
          item.key,
          item.itemId ?? null,
          item.category ?? null,
          item.qty,
          item.unit,
          item.cost,
          item.base,
          item.baseQty,
          item.unitPrice,
        );
      }
    }
    return ids;
  });
}

type LineRow = {
  bill_id: string;
  date: string;
  store: string;
  name: string;
  key: string;
  item_id: string | null;
  category: string | null;
  qty: number;
  unit: string;
  cost: number;
  base: string;
  base_qty: number;
  unit_price: number;
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
 * One scan per request, as in the other two drivers: the right trade at
 * household scale, and it keeps the maths in one tested place.
 */
export async function readLines(): Promise<Line[]> {
  const rows = all<LineRow>(
    `select b.id as bill_id, b.date, b.store,
            i.name, i.key, i.item_id, i.category, i.qty, i.unit, i.cost,
            i.base, i.base_qty, i.unit_price
     from bill_items i join bills b on b.id = i.bill_id
     order by b.date, b.created_at, i.id`,
  );
  return rows.map(toLine);
}

export async function readBills(limit: number): Promise<StoredBill[]> {
  const bills = all<{ id: string; date: string; store: string; note: string; total: number; created_at: string }>(
    "select id, date, store, note, total, created_at from bills order by date desc, created_at desc limit ?",
    limit,
  );
  if (bills.length === 0) return [];

  const byBill = new Map<string, BillLine[]>();
  const holes = bills.map(() => "?").join(", ");
  const lines = all<LineRow>(
    `select bill_id, '' as date, '' as store, name, key, item_id, category,
            qty, unit, cost, base, base_qty, unit_price
     from bill_items where bill_id in (${holes}) order by id`,
    ...bills.map((b) => b.id),
  );
  for (const row of lines) {
    const { billId: _billId, date: _date, store: _store, ...rest } = toLine(row);
    byBill.set(row.bill_id, [...(byBill.get(row.bill_id) ?? []), rest]);
  }

  return bills.map((b) => ({
    id: b.id,
    date: b.date,
    store: b.store,
    note: b.note,
    total: Number(b.total),
    createdAt: b.created_at,
    items: byBill.get(b.id) ?? [],
  }));
}

/** Empties every table. Used only by `seed --clear`. */
export async function clear(): Promise<void> {
  tx((handle) => {
    // bill_items and items go with their parents through the cascade, but the
    // deletes are explicit so this works whether or not foreign keys are on.
    for (const table of [
      "bill_items",
      "bills",
      "items",
      "categories",
      "subscriptions",
      "events",
      "family",
      "chats",
      "devices",
      "controllers",
    ]) {
      handle.exec(`delete from ${table}`);
    }
  });
}

export async function counts(): Promise<{ categories: number; items: number; bills: number }> {
  const [row] = all<{ categories: number; items: number; bills: number }>(
    `select (select count(*) from categories) as categories,
            (select count(*) from items) as items,
            (select count(*) from bills) as bills`,
  );
  return { categories: Number(row.categories), items: Number(row.items), bills: Number(row.bills) };
}

export const close = async () => {
  db?.close();
  db = null;
  openedFile = "";
};
