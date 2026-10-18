/**
 * The whole data API. Everything is stored in MongoDB; nothing is read from or
 * written to disk.
 *
 *   GET  /api/inventory   categories and their items
 *   PUT  /api/inventory   replace the inventory document
 *   POST /api/bills       store a bill, answer with how its prices compare
 *   GET  /api/bills       recent bills, newest first
 *   GET  /api/analytics   spend, projection, deviation and inflation
 *
 * Next.js rewrites all of these here (see next.config.ts), so the browser only
 * ever talks to one origin and there is no CORS configuration anywhere.
 *
 * All the maths and validation lives in lib/ as pure functions; this file is
 * transport only.
 */

import express from "express";
import { analyse, itemKey, priceBook, priceHistory } from "../lib/analytics.ts";
import type { Line } from "../lib/analytics.ts";
import { compareWithHistory, normalizeBill } from "../lib/bill.ts";
import type { PriceRef } from "../lib/bill.ts";
import { normalizeInventory } from "../lib/inventory.ts";
import { bills, categories, dbName, dbUri } from "./db.ts";
import type { BillDoc } from "./db.ts";

const app = express();
app.use(express.json({ limit: "1mb" }));

const flatten = (docs: BillDoc[]): Line[] =>
  docs.flatMap((bill) =>
    bill.items.map((item) => ({
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
    })),
  );

/**
 * Every bill, flattened to purchase lines.
 *
 * A full scan per request, which is the right trade at household scale (a
 * decade of weekly bills is a few thousand small documents) and keeps all the
 * maths in one testable place instead of in an aggregation pipeline. If this
 * ever gets slow, cache the analytics payload and invalidate it on POST.
 */
const allLines = async (): Promise<Line[]> =>
  flatten(await (await bills()).find({}, { sort: { date: 1 } }).toArray());

app.get("/api/inventory", async (_req, res) => {
  const docs = await (await categories()).find({}, { sort: { order: 1 } }).toArray();
  res.json({ categories: docs.map(({ _id, name, items }) => ({ id: _id, name, items })) });
});

/**
 * Replace the whole inventory. The client edits one document and PUTs all of
 * it, so this upserts every category it was given, in order, then drops the
 * ones that are no longer there.
 *
 * ponytail: whole-document replace, last writer wins. Fine for one household;
 * split into per-item routes if this ever gets concurrent editors.
 */
app.put("/api/inventory", async (req, res) => {
  const result = normalizeInventory(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  const keep = result.inventory.categories.map((c) => c.id);
  await (await categories()).bulkWrite(
    [
      ...result.inventory.categories.map((c, order) => ({
        replaceOne: {
          filter: { _id: c.id },
          replacement: { name: c.name, items: c.items, order },
          upsert: true,
        },
      })),
      { deleteMany: { filter: { _id: { $nin: keep } } } },
    ],
    { ordered: true },
  );

  res.json({ ok: true, categories: keep.length });
});

app.post("/api/bills", async (req, res) => {
  const result = normalizeBill(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  const book = priceBook(priceHistory(await allLines())) as Record<string, PriceRef>;
  const comparisons = result.bill.items.map((line) => ({
    name: line.name,
    unitPrice: line.unitPrice,
    base: line.base,
    ...compareWithHistory(line, book[itemKey(line.name)]),
  }));

  const doc = { ...result.bill, createdAt: new Date() };
  const { insertedId } = await (await bills()).insertOne(doc);

  res.status(201).json({ bill: { ...result.bill, id: String(insertedId) }, comparisons });
});

app.get("/api/bills", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  const docs = await (await bills())
    .find({}, { sort: { date: -1, createdAt: -1 }, limit })
    .toArray();

  res.json({
    bills: docs.map(({ _id, createdAt, ...bill }) => ({
      ...bill,
      id: String(_id),
      createdAt: createdAt?.toISOString() ?? null,
    })),
  });
});

app.get("/api/analytics", async (_req, res) => {
  res.json(analyse(await allLines()));
});

// Mongo being down is the expected failure here, and it is the user's to fix,
// so say which database could not be reached rather than returning a bare 500.
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const offline = /ECONNREFUSED|server selection|topology|MongoNetworkError/i.test(`${err.name} ${err.message}`);
  if (offline) return res.status(503).json({ error: `Cannot reach MongoDB at ${dbUri} (database "${dbName}").` });
  // express.json() rejects malformed bodies with a 400 already attached.
  if (err.status && err.status < 500) return res.status(err.status).json({ error: "Could not read that request body." });
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => console.log(`bills api on http://localhost:${port} -> mongodb ${dbUri}/${dbName}`));
