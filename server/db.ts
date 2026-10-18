import { MongoClient } from "mongodb";
import type { Collection, Db, ObjectId } from "mongodb";
import type { Bill } from "../lib/bill.ts";
import type { Item } from "../lib/inventory.ts";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const NAME = process.env.MONGODB_DB ?? "homesystem";

export type BillDoc = Bill & { _id?: ObjectId; createdAt: Date };

/** One document per category; the category's own id is the _id. */
export type CategoryDoc = { _id: string; name: string; items: Item[]; order: number };

let connecting: Promise<Db> | null = null;

/**
 * One lazily-opened connection for the process. A failed connect clears the
 * cache so the next request retries instead of being stuck with a dead promise.
 */
function connect(): Promise<Db> {
  if (!connecting) {
    const client = new MongoClient(URI, { serverSelectionTimeoutMS: 3000 });
    connecting = client
      .connect()
      .then(async (c) => {
        const db = c.db(NAME);
        await db.collection("bills").createIndexes([{ key: { date: -1 } }, { key: { "items.key": 1 } }]);
        await db.collection("categories").createIndexes([{ key: { order: 1 } }, { key: { "items.id": 1 } }]);
        return db;
      })
      .catch((e) => {
        connecting = null;
        throw e;
      });
  }
  return connecting;
}

export const bills = async (): Promise<Collection<BillDoc>> => (await connect()).collection<BillDoc>("bills");

export const categories = async (): Promise<Collection<CategoryDoc>> =>
  (await connect()).collection<CategoryDoc>("categories");

export const dbName = NAME;
export const dbUri = URI;
