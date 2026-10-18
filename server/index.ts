/**
 * The whole data API, over Supabase (Postgres). Five routes:
 *
 *   GET  /api/inventory   categories and their items
 *   PUT  /api/inventory   replace the inventory
 *   POST /api/bills       store one bill, or import an array of them
 *   GET  /api/bills       recent bills, newest first
 *   GET  /api/analytics   spend, projection, deviation and inflation
 *
 * Next.js rewrites all of these here (see next.config.ts), so the browser only
 * ever talks to one origin and there is no CORS configuration anywhere.
 *
 * All the maths and validation lives in lib/ as pure functions, every query
 * lives in db.ts, and this file is transport only.
 */

import express from "express";
import { analyse, itemKey, priceBook, priceHistory } from "../lib/analytics.ts";
import { compareWithHistory, normalizeBills } from "../lib/bill.ts";
import type { PriceRef } from "../lib/bill.ts";
import { normalizeInventory } from "../lib/inventory.ts";
import {
  NotConfigured,
  describeTarget,
  insertBills,
  readBills,
  readInventory,
  readLines,
  writeInventory,
} from "./db.ts";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/inventory", async (_req, res) => {
  res.json(await readInventory());
});

app.put("/api/inventory", async (req, res) => {
  const result = normalizeInventory(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  await writeInventory(result.inventory);
  res.json({ ok: true, categories: result.inventory.categories.length });
});

/**
 * One bill as an object, or an import of up to 100 as an array. A single bill
 * comes back with its prices compared against the history; an import comes back
 * as a count, because comparing a batch against a history it is itself
 * extending would report nonsense.
 */
app.post("/api/bills", async (req, res) => {
  const batch = Array.isArray(req.body);
  const result = normalizeBills(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });

  if (batch) {
    const ids = await insertBills(result.bills);
    const dates = result.bills.map((b) => b.date).sort();
    return res.status(201).json({
      imported: ids.length,
      items: result.bills.reduce((n, b) => n + b.items.length, 0),
      total: Math.round(result.bills.reduce((t, b) => t + b.total, 0) * 100) / 100,
      from: dates[0],
      to: dates[dates.length - 1],
    });
  }

  const [bill] = result.bills;
  const book = priceBook(priceHistory(await readLines())) as Record<string, PriceRef>;
  const comparisons = bill.items.map((line) => ({
    name: line.name,
    unitPrice: line.unitPrice,
    base: line.base,
    ...compareWithHistory(line, book[itemKey(line.name)]),
  }));

  const [id] = await insertBills([bill]);
  res.status(201).json({ bill: { ...bill, id }, comparisons });
});

app.get("/api/bills", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  res.json({ bills: await readBills(limit) });
});

app.get("/api/analytics", async (_req, res) => {
  res.json(analyse(await readLines()));
});

// An unreachable or unconfigured database is the expected failure here, and it
// is the user's to fix, so name what was tried rather than returning a bare 500.
app.use((err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof NotConfigured) return res.status(503).json({ error: err.message });

  const offline = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECT_TIMEOUT|terminating connection|password authentication/i.test(
    `${err.name} ${err.code} ${err.message}`,
  );
  if (offline) return res.status(503).json({ error: `Cannot reach the database at ${describeTarget()}. (${err.message})` });

  // A missing table means the schema was never applied — say so, it is one command.
  if (err.code === "42P01") {
    return res.status(503).json({ error: "The tables are missing. Apply supabase/schema.sql (mise run migrate)." });
  }

  if (err.status && err.status < 500) return res.status(err.status).json({ error: "Could not read that request body." });

  console.error(err);
  res.status(500).json({ error: "Server error." });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => console.log(`data api on http://localhost:${port} -> postgres ${describeTarget()}`));
