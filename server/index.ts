/**
 * The whole data API. DB_SELECT in .env chooses SQLite, MongoDB or Supabase. Routes:
 *
 *   GET  /api/inventory   categories and their items
 *   PUT  /api/inventory   replace the inventory
 *   POST /api/bills       store one bill, or import an array of them
 *   GET  /api/bills       recent bills, newest first
 *   GET  /api/analytics   spend, projection, deviation and inflation
 *   GET  /api/subscriptions   household subscriptions
 *   PUT  /api/subscriptions   replace subscriptions
 *   GET  /api/calendar    the shared family calendar
 *   PUT  /api/calendar    replace it
 *   GET  /api/family      who lives here
 *   PUT  /api/family      replace them
 *   GET  /api/devices     the smart-home registry: controllers and devices
 *   PUT  /api/devices     replace it
 *   GET  /api/devices/state    live readings, through the edge controllers
 *   POST /api/devices/command  switch or set one device
 *   GET  /api/devices/check    one controller's /health, for the setup page
 *   GET  /api/mcp         the tools this server exposes, and the servers in .mcp.json
 *   POST /api/mcp         MCP itself, JSON-RPC (see mcp.ts)
 *   POST /api/chat        one chat turn against the configured model, tools included
 *   GET  /api/chat-log    what was asked, a day at a time
 *   GET  /api/settings    the .env-backed settings and whether the database answers
 *   PUT  /api/settings    write some of them back
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
import { normalizeSubscriptions } from "../lib/subscriptions.ts";
import { normalizeCalendar } from "../lib/calendar.ts";
import { normalizeFamily } from "../lib/family.ts";
import { normalizeDevices, planCommand } from "../lib/devices.ts";
import { appendToDay, sortDays, toLogged, type LoggedMessage } from "../lib/chat-log.ts";
import { todayISO } from "../lib/calendar.ts";
import { chat, currentProvider, describeProviders, isProvider } from "./chat.ts";
import { mcpEndpoint, mcpInfo } from "./mcp.ts";
import { checkController, forgetHomeState, readHomeState, sendCommand } from "./edge.ts";
import { readSettings, writeSettings } from "./settings.ts";
import {
  NotConfigured,
  describeTarget,
  insertBills,
  readBills,
  readCalendar,
  readChatDays,
  readDevices,
  readFamily,
  readInventory,
  readLines,
  readSubscriptions,
  writeCalendar,
  writeChatDay,
  writeDevices,
  writeFamily,
  writeInventory,
  writeSubscriptions,
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

app.get("/api/subscriptions", async (_req, res) => {
  res.json(await readSubscriptions());
});

app.put("/api/subscriptions", async (req, res) => {
  const result = normalizeSubscriptions(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });
  await writeSubscriptions(result.doc);
  res.json({ ok: true, count: result.doc.subscriptions.length });
});

app.get("/api/calendar", async (_req, res) => {
  res.json(await readCalendar());
});

app.put("/api/calendar", async (req, res) => {
  const result = normalizeCalendar(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });
  await writeCalendar(result.doc);
  res.json({ ok: true, count: result.doc.events.length });
});

app.get("/api/family", async (_req, res) => {
  res.json(await readFamily());
});

app.put("/api/family", async (req, res) => {
  const result = normalizeFamily(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });
  await writeFamily(result.doc);
  res.json({ ok: true, count: result.doc.people.length });
});

/* ---------------- smart home ---------------- */

app.get("/api/devices", async (_req, res) => {
  res.json(await readDevices());
});

app.put("/api/devices", async (req, res) => {
  const result = normalizeDevices(req.body);
  if ("error" in result) return res.status(400).json({ error: result.error });
  await writeDevices(result.doc);
  // The cached readings are keyed by device id; a renamed address or a deleted
  // device must not be answered from the reading taken before the change.
  forgetHomeState();
  res.json({ ok: true, controllers: result.doc.controllers.length, devices: result.doc.devices.length });
});

/**
 * What the house is doing right now. Always 200 when the registry reads: a
 * controller that is unreachable is reported as such alongside the ones that
 * answered, because "the kitchen Pi is down" is the useful answer and a 502
 * would hide the four devices that are fine.
 */
app.get("/api/devices/state", async (_req, res) => {
  res.json(await readHomeState(await readDevices()));
});

/**
 * Switch or set one device. Two gates, in this order: the device has to be in
 * the registry, and `planCommand` has to agree the instruction is one that
 * device takes. Only then does anything reach the controller.
 */
app.post("/api/devices/command", async (req, res) => {
  const id = String(req.body?.deviceId ?? "").trim();
  if (!id) return res.status(400).json({ error: "deviceId is required." });

  const doc = await readDevices();
  const device = doc.devices.find((d) => d.id === id);
  if (!device) return res.status(404).json({ error: `No device with id "${id}".` });

  const controller = doc.controllers.find((c) => c.id === device.controller);
  if (!controller) return res.status(409).json({ error: `${device.name || id} has no controller.` });

  const plan = planCommand(device, {
    power: req.body?.power,
    setpoint: req.body?.setpoint,
    mode: req.body?.mode,
    fan: req.body?.fan,
  });
  if ("error" in plan) return res.status(400).json({ error: plan.error });

  const sent = await sendCommand(controller, device, plan.command);
  // The controller being off or refusing is the household's to fix and the
  // message says which, so it is a 502 with the reason and not a 500.
  if (!sent.ok) return res.status(502).json({ error: sent.error, sent: plan.command });
  res.json({ ok: true, sent: plan.command, clamped: plan.clamped, state: sent.state });
});

/** GET /api/devices/check?controller=<id> — the setup page's Test button. */
app.get("/api/devices/check", async (req, res) => {
  const id = String(req.query.controller ?? "").trim();
  const { controllers } = await readDevices();
  const controller = controllers.find((c) => c.id === id);
  if (!controller) return res.status(404).json({ error: `No controller with id "${id}".` });
  res.json(await checkController(controller));
});

app.get("/api/mcp", (_req, res) => {
  res.json({ ...mcpInfo(), providers: describeProviders(), provider: currentProvider() });
});
app.post("/api/mcp", mcpEndpoint);

app.get("/api/settings", readSettings);
app.put("/api/settings", writeSettings);

app.get("/api/chat-log", async (_req, res) => {
  res.json({ days: sortDays(await readChatDays()) });
});

/**
 * Keep the turn. Written here rather than by the browser so a turn that failed
 * leaves nothing behind, and so the log is the same whichever client asked.
 * A failure to write must not lose the answer the user is waiting for, so it
 * is logged and swallowed.
 */
async function remember(question: unknown, added: unknown[]) {
  try {
    const logged = [question, ...added]
      .map((m) => toLogged(m as Parameters<typeof toLogged>[0]))
      .filter((m): m is LoggedMessage => m !== null);
    if (!logged.length) return;

    const date = todayISO();
    const today = (await readChatDays()).find((d) => d.date === date) ?? { date, messages: [] };
    await writeChatDay(appendToDay(today, logged));
  } catch (e) {
    console.error("could not write the chat log:", (e as Error).message);
  }
}

app.post("/api/chat", async (req, res) => {
  const asked = String(req.body?.provider ?? "").trim();
  if (asked && !isProvider(asked)) return res.status(400).json({ error: `Unknown inference engine: ${asked}` });
  const provider = isProvider(asked) ? asked : currentProvider();

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages must be a non-empty array." });
  if (messages.length > 60) return res.status(400).json({ error: "That conversation is too long. Start a new one." });

  try {
    const turn = await chat(provider, messages);
    res.json(turn);
    await remember(messages[messages.length - 1], turn.messages);
  } catch (e) {
    // The model being unreachable, unkeyed or wrong is the user's to fix, and
    // the message already says which — it is not a 500.
    res.status(502).json({ error: (e as Error).message });
  }
});

// An unreachable or unconfigured database is the expected failure here, and it
// is the user's to fix, so name what was tried rather than returning a bare 500.
app.use((err: Error & { status?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof NotConfigured) return res.status(503).json({ error: err.message });

  const detail = `${err.name} ${err.code} ${err.message}`;
  // SQLITE_CANTOPEN and friends are the same class of problem as a refused
  // connection: the database named in .env is not usable, and it is the
  // household's to fix. A locked file gets its own line because the fix is
  // different — something else has the file open.
  const offline =
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECT_TIMEOUT|terminating connection|password authentication|MongoNetworkError|MongoServerSelectionError|server selection|SQLITE_CANTOPEN|SQLITE_READONLY|SQLITE_NOTADB|EACCES|EPERM/i.test(
      detail,
    );
  if (offline) return res.status(503).json({ error: `Cannot reach the database at ${describeTarget()}. (${err.message})` });

  if (/SQLITE_BUSY|database is locked/i.test(detail)) {
    return res.status(503).json({ error: `${describeTarget()} is locked by another process. (${err.message})` });
  }

  // A missing table means the schema was never applied — say so, it is one command.
  if (err.code === "42P01") {
    return res.status(503).json({ error: "The tables are missing. Apply supabase/schema.sql (mise run migrate)." });
  }

  if (err.status && err.status < 500) return res.status(err.status).json({ error: "Could not read that request body." });

  console.error(err);
  res.status(500).json({ error: "Server error." });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => console.log(`data api on http://localhost:${port} -> ${describeTarget()}`));
