/**
 * The household data as MCP tools, served at POST /api/mcp.
 *
 * One registry, two consumers: an external MCP client (Claude Code, any other)
 * speaking JSON-RPC at that route, and the chat window on /mcp, which hands the
 * same tool list to whichever model the settings name. Both therefore see
 * exactly the same tools with the same arguments.
 *
 * ponytail: hand-rolled JSON-RPC — tools only, one JSON response per request,
 * no SSE stream, no sessions, no resources or prompts. If a client needs any of
 * that, swap this transport for @modelcontextprotocol/sdk; the TOOLS array
 * below is already the right shape to hand straight to it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { analyse, itemReport } from "../lib/analytics.ts";
import { normalizeBill } from "../lib/bill.ts";
import { allInventoryItems } from "../lib/match-inventory.ts";
import { isLow, lowStock, newId, totals } from "../lib/inventory.ts";
import { addPerson, blankEvent, normalizeCalendar, todayISO, upcoming } from "../lib/calendar.ts";
import { familyNames } from "../lib/family.ts";
import { KINDS, describeState, planCommand, stateSummary } from "../lib/devices.ts";
import type { Item } from "../lib/inventory.ts";
import {
  insertBills,
  readBills,
  readCalendar,
  readDevices,
  readFamily,
  readInventory,
  readLines,
  readSubscriptions,
  writeCalendar,
  writeInventory,
} from "./db.ts";
import { readHomeState, sendCommand } from "./edge.ts";

export const PROTOCOL_VERSION = "2025-06-18";

type Json = Record<string, unknown>;

export type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Json; required?: string[] };
  run: (args: Json) => Promise<unknown>;
};

const str = (args: Json, key: string) => String(args[key] ?? "").trim();

const num = (args: Json, key: string, fallback: number) => {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
};

const brief = (item: Item, category: string) => ({
  name: item.name,
  category,
  qty: item.qty,
  min: item.min,
  unit: item.unit,
  tags: item.tags ?? [],
  low: isLow(item),
});

export const TOOLS: Tool[] = [
  {
    name: "list_inventory",
    description:
      "Every tracked item with its quantity, minimum and tags. Pass a category or tag to narrow it down.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Only items in this category." },
        tag: { type: "string", description: "Only items carrying this tag." },
      },
    },
    run: async (args) => {
      const category = str(args, "category").toLowerCase();
      const tag = str(args, "tag").toLowerCase();
      const inv = await readInventory();
      const items = allInventoryItems(inv)
        .filter((row) => !category || row.category.toLowerCase() === category)
        .filter((row) => !tag || (row.item.tags ?? []).includes(tag))
        .map((row) => brief(row.item, row.category));
      return { totals: totals(inv), items };
    },
  },
  {
    name: "low_stock",
    description: "Items at or below their minimum — what the household should buy next.",
    inputSchema: { type: "object", properties: {} },
    run: async () => ({ items: lowStock(await readInventory()) }),
  },
  {
    name: "set_quantity",
    description:
      "Set how much of one item is in the house right now. Matches on the item name, case-insensitively.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string", description: "The item name, as it appears in the inventory." },
        quantity: { type: "number", description: "The new count, in the item's own unit." },
      },
      required: ["item", "quantity"],
    },
    run: async (args) => {
      const wanted = str(args, "item").toLowerCase();
      const quantity = Math.max(0, num(args, "quantity", -1));
      if (!wanted) throw new Error("item is required.");
      if (quantity < 0) throw new Error("quantity must be a number of 0 or more.");

      const inv = await readInventory();
      const hit = allInventoryItems(inv).find((row) => row.item.name.toLowerCase() === wanted);
      if (!hit) {
        const near = allInventoryItems(inv)
          .filter((row) => row.item.name.toLowerCase().includes(wanted))
          .map((row) => row.item.name);
        throw new Error(
          near.length ? `No item called "${wanted}". Did you mean: ${near.join(", ")}?` : `No item called "${wanted}".`,
        );
      }

      const was = hit.item.qty;
      await writeInventory({
        categories: inv.categories.map((c) => ({
          ...c,
          items: c.items.map((i) => (i.id === hit.item.id ? { ...i, qty: quantity } : i)),
        })),
      });
      return { item: hit.item.name, category: hit.category, was, now: quantity, low: quantity <= hit.item.min };
    },
  },
  {
    name: "recent_bills",
    description: "The most recent bills, newest first, with their lines.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many bills, 1 to 50. Default 10." } },
    },
    run: async (args) => ({
      bills: await readBills(Math.min(Math.max(num(args, "limit", 10), 1), 50)),
    }),
  },
  {
    name: "add_bill",
    description:
      "Record one shopping bill. Each line needs a name, quantity, unit and cost; the per-unit price is worked out here.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        date: { type: "string", description: "yyyy-mm-dd. Defaults to today." },
        items: {
          type: "array",
          description: "The lines on the bill.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              qty: { type: "number" },
              unit: { type: "string", description: "kg, g, L, ml, pcs, pack..." },
              cost: { type: "number", description: "What the whole line cost." },
            },
            required: ["name", "qty", "unit", "cost"],
          },
        },
      },
      required: ["store", "items"],
    },
    run: async (args) => {
      const result = normalizeBill(args);
      if ("error" in result) throw new Error(result.error);
      const [id] = await insertBills([result.bill]);
      return { id, date: result.bill.date, store: result.bill.store, total: result.bill.total, lines: result.bill.items.length };
    },
  },
  {
    name: "spend_summary",
    description:
      "Spend by month, category and store, the projection for the months ahead, price inflation and the biggest price deviations.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      // `lines` and the full price book are the raw material the charts page
      // needs; a model only needs the conclusions, and they cost far less.
      const { lines: _lines, priceBook: _book, inflation, ...rest } = analyse(await readLines());
      return { ...rest, inflation: { ...inflation, perItem: inflation.perItem.slice(0, 20) } };
    },
  },
  {
    name: "price_history",
    description:
      "One item's full buying history: every price paid, how often it gets bought, when it is next due, and which shop is cheapest.",
    inputSchema: {
      type: "object",
      properties: { item: { type: "string", description: "The item name." } },
      required: ["item"],
    },
    run: async (args) => {
      const name = str(args, "item");
      if (!name) throw new Error("item is required.");
      const report = itemReport(await readLines(), { name });
      if (!report) throw new Error(`No bill has ever had "${name}" on it.`);
      return report;
    },
  },
  {
    name: "list_subscriptions",
    description: "Every subscription the household pays for, with its type, holder and shared seats.",
    inputSchema: { type: "object", properties: {} },
    run: async () => await readSubscriptions(),
  },
  {
    name: "list_family",
    description: "Who lives in this household, with their role. These are the names calendar entries use.",
    inputSchema: { type: "object", properties: {} },
    run: async () => await readFamily(),
  },
  {
    name: "list_events",
    description:
      "What the family has planned. Returns what is still to come by default; pass a date range to see any window.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "yyyy-mm-dd. Defaults to today." },
        to: { type: "string", description: "yyyy-mm-dd. Open-ended when left out." },
        limit: { type: "number", description: "How many events, 1 to 100. Default 20." },
      },
    },
    run: async (args) => {
      const from = str(args, "from") || todayISO();
      const to = str(args, "to");
      const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
      const { events } = await readCalendar();
      const window = to ? events.filter((e) => e.date <= to) : events;
      return { from, to: to || null, events: upcoming(window, from, limit) };
    },
  },
  {
    name: "add_event",
    description:
      "Put something on the family calendar — a movie night, a birthday, a visit. One occurrence; there is no recurrence. Everything but the title is optional.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What it is." },
        date: { type: "string", description: "yyyy-mm-dd. Defaults to today." },
        time: { type: "string", description: "HH:MM, 24-hour. Leave out for an all-day event." },
        endTime: { type: "string", description: "HH:MM, after the start time and on the same day." },
        kind: { type: "string", description: "The activity: movie, dinner, trip, party, appointment..." },
        venue: { type: "string", description: "Where it is — the cinema, the restaurant, the house." },
        link: { type: "string", description: "Tickets, the booking, the invite." },
        people: {
          type: "array",
          description: "Who is included, by name.",
          items: { type: "string" },
        },
        reservation: {
          type: "string",
          description: 'Booking status: "needed", "booked", or left out when none is needed.',
          enum: ["", "needed", "booked"],
        },
        reservedUnder: { type: "string", description: "Whose name the booking is in." },
        createdBy: { type: "string", description: "Who is adding it. Only they can edit it afterwards." },
        notes: { type: "string" },
      },
      required: ["title"],
    },
    run: async (args) => {
      const invited = Array.isArray(args.people) ? args.people : String(args.people ?? "").split(",");
      const event = blankEvent(newId(), str(args, "date") || todayISO(), {
        title: str(args, "title"),
        time: str(args, "time"),
        endTime: str(args, "endTime"),
        kind: str(args, "kind"),
        venue: str(args, "venue"),
        link: str(args, "link"),
        people: invited.reduce<string[]>((people, name) => addPerson(people, String(name)), []),
        reservation: str(args, "reservation") as ReturnType<typeof blankEvent>["reservation"],
        reservedUnder: str(args, "reservedUnder"),
        createdBy: str(args, "createdBy"),
        notes: str(args, "notes"),
      });
      if (!event.title) throw new Error("title is required.");
      const { events } = await readCalendar();
      // The whole calendar goes back through the same gate the API uses, so a
      // model cannot write an event the page would refuse.
      const result = normalizeCalendar({ events: [...events, event] });
      if ("error" in result) throw new Error(result.error);
      await writeCalendar(result.doc);
      return { added: result.doc.events.find((e) => e.id === event.id), total: result.doc.events.length };
    },
  },
  {
    name: "list_devices",
    description:
      "Every device the house can monitor or control, with its room, what it is, and what it will take an instruction about. Readings are live, through the edge controllers.",
    inputSchema: {
      type: "object",
      properties: {
        room: { type: "string", description: "Only devices in this room." },
        kind: {
          type: "string",
          description: "Only devices of this kind.",
          enum: Object.keys(KINDS),
        },
      },
    },
    run: async (args) => {
      const room = str(args, "room").toLowerCase();
      const kind = str(args, "kind").toLowerCase();
      const registry = await readDevices();
      const home = await readHomeState(registry);
      const devices = registry.devices
        .filter((d) => !room || d.room.toLowerCase() === room)
        .filter((d) => !kind || d.kind === kind)
        .map((device) => {
          const state = home.states[device.id];
          return {
            id: device.id,
            name: device.name,
            kind: device.kind,
            room: device.room,
            controls: device.readOnly ? [] : KINDS[device.kind].controls,
            readOnly: device.readOnly,
            online: state?.online ?? false,
            power: state?.power ?? null,
            reading: state?.value ?? null,
            unit: KINDS[device.kind].unit,
            setpoint: state?.setpoint ?? null,
            mode: state?.mode || null,
            fan: state?.fan || null,
            watts: state?.watts ?? null,
            says: describeState(device, state),
          };
        });
      return {
        summary: stateSummary(registry.devices, home.states),
        controllers: home.controllers.map((c) => ({ name: c.name, ok: c.ok, error: c.error ?? null })),
        devices,
        at: home.at,
      };
    },
  },
  {
    name: "set_device",
    description:
      "Switch a device on or off, or set its target temperature, mode or fan speed. Matches on the device name, case-insensitively. A device set to monitor only is refused, and a target outside what the unit allows is brought back to its nearest limit.",
    inputSchema: {
      type: "object",
      properties: {
        device: { type: "string", description: "The device name, as list_devices gives it." },
        power: { type: "boolean", description: "true to switch it on, false to switch it off." },
        setpoint: { type: "number", description: "Target temperature, in the device's own unit." },
        mode: { type: "string", description: "cool, dry, fan, heat, auto — whatever that unit has." },
        fan: { type: "string", description: "auto, low, medium, high." },
      },
      required: ["device"],
    },
    run: async (args) => {
      const wanted = str(args, "device").toLowerCase();
      if (!wanted) throw new Error("device is required.");

      const registry = await readDevices();
      const device = registry.devices.find((d) => d.name.toLowerCase() === wanted);
      if (!device) {
        const near = registry.devices.filter((d) => d.name.toLowerCase().includes(wanted)).map((d) => d.name);
        throw new Error(
          near.length ? `No device called "${wanted}". Did you mean: ${near.join(", ")}?` : `No device called "${wanted}".`,
        );
      }

      const controller = registry.controllers.find((c) => c.id === device.controller);
      if (!controller) throw new Error(`${device.name} has no controller, so nothing can reach it.`);

      // The same gate the page and the API use, so a model cannot ask for
      // something the hardware was never configured to accept.
      const plan = planCommand(device, {
        power: typeof args.power === "boolean" ? args.power : undefined,
        setpoint: args.setpoint === undefined ? undefined : Number(args.setpoint),
        mode: args.mode === undefined ? undefined : str(args, "mode"),
        fan: args.fan === undefined ? undefined : str(args, "fan"),
      });
      if ("error" in plan) throw new Error(plan.error);

      const sent = await sendCommand(controller, device, plan.command);
      if (!sent.ok) throw new Error(sent.error);
      return {
        device: device.name,
        sent: plan.command,
        clamped: plan.clamped,
        state: sent.state,
        says: sent.state ? describeState(device, sent.state) : "The controller did not report back.",
      };
    },
  },
];

export const toolSchemas = () =>
  TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

/**
 * Runs a tool and always comes back with text, because that is what both an MCP
 * client and a chat model expect to put in front of a person. A thrown error is
 * the tool's own answer ("no item called X"), not a transport failure.
 */
export async function callTool(name: string, args: Json): Promise<{ text: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `No such tool: ${name}`, isError: true };
  try {
    return { text: JSON.stringify(await tool.run(args ?? {}), null, 2), isError: false };
  } catch (e) {
    return { text: (e as Error).message, isError: true };
  }
}

type ServerConfig = { type?: string; url?: string; command?: string; args?: string[] };

/**
 * The MCP servers this project itself is configured to talk to, from .mcp.json.
 * The query string is dropped on the way out — Supabase puts the project ref
 * and the feature list in it, and some servers put a token there too.
 */
export function externalServers() {
  try {
    const file = fileURLToPath(new URL("../.mcp.json", import.meta.url));
    const config = JSON.parse(readFileSync(file, "utf8")) as { mcpServers?: Record<string, ServerConfig> };
    return Object.entries(config.mcpServers ?? {}).map(([name, server]) => {
      const url = server.url ? new URL(server.url) : null;
      return {
        name,
        transport: server.type ?? (server.command ? "stdio" : "http"),
        target: url ? `${url.origin}${url.pathname}` : [server.command, ...(server.args ?? [])].filter(Boolean).join(" "),
        features: (url?.searchParams.get("features") ?? "").split(",").filter(Boolean),
      };
    });
  } catch {
    return [];
  }
}

/** What this server offers, and who else is wired up. Served at GET /api/mcp. */
export const mcpInfo = () => ({
  name: "home-system",
  protocolVersion: PROTOCOL_VERSION,
  endpoint: "/api/mcp",
  tools: toolSchemas(),
  servers: externalServers(),
});

const result = (id: unknown, value: Json) => ({ jsonrpc: "2.0", id, result: value });
const failure = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** POST /api/mcp — one JSON-RPC request or a batch of them. */
export async function mcpEndpoint(req: Request, res: Response) {
  const batch = Array.isArray(req.body) ? req.body : [req.body];
  const replies = (await Promise.all(batch.map(handle))).filter((r) => r !== null);
  // Notifications have no id and get no reply; a batch of only those is a 202.
  if (!replies.length) return res.status(202).end();
  res.json(Array.isArray(req.body) ? replies : replies[0]);
}

async function handle(message: Json): Promise<Json | null> {
  const { id, method, params } = (message ?? {}) as { id?: unknown; method?: string; params?: Json };
  if (id === undefined) return null;

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "home-system", version: "0.1.0" },
      });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: toolSchemas() });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const { text, isError } = await callTool(name, (params?.arguments as Json) ?? {});
      return result(id, { content: [{ type: "text", text }], isError });
    }
    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}
