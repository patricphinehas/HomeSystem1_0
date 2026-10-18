/**
 * MongoDB connection and the queries behind the API.
 * Used when DB_SELECT=mongodb.
 *
 * One document per category (`_id` is the category id, `order` is the tab
 * order, items embedded). One document per bill. Subscriptions are their own
 * collection, same shape as the API. Local standalone Mongo has no
 * multi-document transactions, so a replace is one ordered bulk write.
 */

import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { Bill, BillLine, StoredBill } from "../lib/bill.ts";
import type { Inventory, Item } from "../lib/inventory.ts";
import type { Subscription, SubscriptionsDoc } from "../lib/subscriptions.ts";
import type { Line } from "../lib/analytics.ts";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const NAME = process.env.MONGODB_DB ?? "homesystem";

type CategoryDoc = { _id: string; name: string; items: Item[]; order: number };
type BillDoc = Bill & { _id?: ObjectId; createdAt: Date };
type SubscriptionDoc = Omit<Subscription, "id"> & { _id: string; order: number };

let client: MongoClient | null = null;
let connecting: Promise<Db> | null = null;

function connect(): Promise<Db> {
  if (!connecting) {
    const opened = new MongoClient(URI, { serverSelectionTimeoutMS: 3000 });
    client = opened;
    connecting = opened
      .connect()
      .then(async (c) => {
        const db = c.db(NAME);
        await db.collection("bills").createIndexes([{ key: { date: -1 } }, { key: { "items.key": 1 } }]);
        await db.collection("categories").createIndexes([{ key: { order: 1 } }, { key: { "items.id": 1 } }]);
        await db.collection("subscriptions").createIndexes([{ key: { order: 1 } }]);
        return db;
      })
      .catch((e) => {
        connecting = null;
        client = null;
        throw e;
      });
  }
  return connecting;
}

const categories = async (): Promise<Collection<CategoryDoc>> => (await connect()).collection<CategoryDoc>("categories");
const bills = async (): Promise<Collection<BillDoc>> => (await connect()).collection<BillDoc>("bills");
const subscriptions = async (): Promise<Collection<SubscriptionDoc>> =>
  (await connect()).collection<SubscriptionDoc>("subscriptions");

/** Reported by the API and by `doctor`, with any credentials left out. */
export const describeTarget = () => {
  try {
    const u = new URL(URI);
    return `${u.hostname}:${u.port || 27017}/${NAME}`;
  } catch {
    return NAME;
  }
};

export async function serverInfo(): Promise<string> {
  const info = await (await connect()).admin().command({ buildInfo: 1 });
  return `MongoDB ${info.version}`;
}

export const applySchema = async () => {
  await connect();
};

export async function readInventory(): Promise<Inventory> {
  const docs = await (await categories()).find({}, { sort: { order: 1 } }).toArray();
  return { categories: docs.map(({ _id, name, items }) => ({ id: _id, name, items })) };
}

/**
 * Replace the whole inventory. Upsert every category that was sent, in order,
 * then drop the ones that are no longer there.
 *
 * ponytail: whole-document replace, last writer wins. Fine for one household;
 * split into per-item routes if this ever gets concurrent editors.
 */
export async function writeInventory(inventory: Inventory): Promise<void> {
  const keep = inventory.categories.map((c) => c.id);
  await (await categories()).bulkWrite(
    [
      ...inventory.categories.map((c, order) => ({
        replaceOne: {
          filter: { _id: c.id },
          replacement: { _id: c.id, name: c.name, items: c.items, order },
          upsert: true,
        },
      })),
      { deleteMany: { filter: { _id: { $nin: keep } } } },
    ],
    { ordered: true },
  );
}

export async function readSubscriptions(): Promise<SubscriptionsDoc> {
  const docs = await (await subscriptions()).find({}, { sort: { order: 1 } }).toArray();
  return {
    subscriptions: docs.map(({ _id, name, type, tag, holder, shareable, shareCount }) => ({
      id: _id,
      name,
      type,
      tag,
      holder,
      shareable,
      shareCount,
    })),
  };
}

export async function writeSubscriptions(doc: SubscriptionsDoc): Promise<void> {
  const keep = doc.subscriptions.map((s) => s.id);
  await (await subscriptions()).bulkWrite(
    [
      ...doc.subscriptions.map((s, order) => ({
        replaceOne: {
          filter: { _id: s.id },
          replacement: {
            _id: s.id,
            name: s.name,
            type: s.type,
            tag: s.tag,
            holder: s.holder,
            shareable: s.shareable,
            shareCount: s.shareCount,
            order,
          },
          upsert: true,
        },
      })),
      { deleteMany: { filter: { _id: { $nin: keep } } } },
    ],
    { ordered: true },
  );
}

export async function insertBills(incoming: Bill[]): Promise<string[]> {
  const docs = incoming.map((bill) => ({ ...bill, createdAt: new Date() }));
  const { insertedIds } = await (await bills()).insertMany(docs);
  return docs.map((_, i) => String(insertedIds[i]));
}

const toLine = (bill: BillDoc, item: BillLine): Line => ({
  billId: String(bill._id),
  date: bill.date,
  store: bill.store,
  name: item.name,
  key: item.key,
  itemId: item.itemId,
  category: item.category,
  qty: item.qty,
  unit: item.unit,
  cost: item.cost,
  base: item.base,
  baseQty: item.baseQty,
  unitPrice: item.unitPrice,
});

export async function readLines(): Promise<Line[]> {
  const docs = await (await bills()).find({}, { sort: { date: 1, createdAt: 1 } }).toArray();
  return docs.flatMap((bill) => bill.items.map((item) => toLine(bill, item)));
}

const createdAtOf = (value: Date | undefined) => (value instanceof Date ? value.toISOString() : "");

export async function readBills(limit: number): Promise<StoredBill[]> {
  const docs = await (await bills()).find({}, { sort: { date: -1, createdAt: -1 }, limit }).toArray();
  return docs.map(({ _id, createdAt, ...bill }) => ({
    ...bill,
    id: String(_id),
    createdAt: createdAtOf(createdAt),
  }));
}

export async function clear(): Promise<void> {
  await Promise.all([
    (await categories()).deleteMany({}),
    (await bills()).deleteMany({}),
    (await subscriptions()).deleteMany({}),
  ]);
}

export async function counts(): Promise<{ categories: number; items: number; bills: number }> {
  const cat = await categories();
  const [categoriesN, billsN, docs] = await Promise.all([
    cat.countDocuments(),
    (await bills()).countDocuments(),
    cat.find({}, { projection: { items: 1 } }).toArray(),
  ]);
  return {
    categories: categoriesN,
    items: docs.reduce((n, doc) => n + doc.items.length, 0),
    bills: billsN,
  };
}

export const close = async () => {
  await client?.close();
  client = null;
  connecting = null;
};
