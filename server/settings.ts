/**
 * The settings page, backed by `.env`.
 *
 * Everything here is a process-wide setting the server needs before it can talk
 * to anything, so `.env` is the store — a database setting cannot live in the
 * database, and an API key has to be somewhere the browser never sees it. The
 * theme is the exception and stays in the browser, where it belongs.
 *
 * A write patches `.env` and sets `process.env` so the change is live. Two
 * things are read once at module load by the drivers — the Mongo URI and the
 * Postgres URL — so changing a connection string is reported back as needing a
 * restart rather than silently doing nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { Request, Response } from "express";
import { patchEnv } from "../lib/env-file.ts";
import { DEFAULT_REGION, isCurrency, isLocale, isTimezone, setRegion } from "../lib/region.ts";
import { DB_CHOICES } from "./db-select.ts";
import { PROVIDERS, currentProvider, describeProviders } from "./chat.ts";
import { counts, describeTarget, serverInfo } from "./db.ts";
import { envFile } from "./paths.ts";

type Field = {
  key: string;
  group: "user" | "region" | "database" | "inference";
  label: string;
  hint?: string;
  /** Never sent to the browser; an empty value on a save means "leave it". */
  secret?: boolean;
  /** Read once at startup, so a change only takes effect after a restart. */
  restart?: boolean;
  choices?: readonly string[];
  placeholder?: string;
  /** Rejects a bad value on save, so a typo cannot break every date on screen. */
  valid?: (value: string) => boolean;
  /** What to say when it does. */
  expected?: string;
  /**
   * Which list the settings page should offer. Built in the browser from Intl
   * rather than sent from here: 418 timezones is 20KB on a route the sidebar
   * fetches on every page, and the answer is validated here either way.
   */
  options?: "locale" | "timezone" | "currency";
};

export const FIELDS: Field[] = [
  { key: "USER_NAME", group: "user", label: "Your name", placeholder: "Who is using this", hint: "Shown in the header, and the name your calendar entries and comments are signed with." },
  { key: "HOUSEHOLD_NAME", group: "user", label: "Household", placeholder: "Home System" },

  { key: "LOCALE", group: "region", label: "Region", placeholder: DEFAULT_REGION.locale, hint: "Sets how dates and numbers are written.", valid: isLocale, expected: "a language tag such as en-IN", options: "locale" },
  { key: "TIMEZONE", group: "region", label: "Timezone", placeholder: "Asia/Kolkata", hint: "Leave it unset and \"today\" means today wherever you are reading.", valid: (v) => !v || isTimezone(v), expected: "an IANA zone such as Asia/Kolkata", options: "timezone" },
  { key: "CURRENCY", group: "region", label: "Currency", placeholder: DEFAULT_REGION.currency, hint: "Bills already stored are not converted — only how they are written changes.", valid: isCurrency, expected: "a three-letter code such as INR", options: "currency" },

  { key: "DB_SELECT", group: "database", label: "Database", choices: DB_CHOICES, hint: "Switches immediately — the other database has to be configured and running." },
  { key: "MONGODB_URI", group: "database", label: "MongoDB URI", secret: true, restart: true, placeholder: "mongodb://127.0.0.1:27017" },
  { key: "MONGODB_DB", group: "database", label: "MongoDB database", restart: true, placeholder: "homesystem" },
  { key: "DATABASE_URL", group: "database", label: "Postgres / Supabase URL", secret: true, restart: true, hint: "Use the pooler host on port 6543; URL-encode the password." },

  { key: "CHAT_PROVIDER", group: "inference", label: "Inference engine", choices: Object.keys(PROVIDERS) },
  { key: "OLLAMA_URL", group: "inference", label: "Ollama host", placeholder: "http://127.0.0.1:11434" },
  { key: "OLLAMA_MODEL", group: "inference", label: "Ollama model", placeholder: "llama3.1", hint: "Needs a model that supports tool calling." },
  { key: "NVIDIA_API_KEY", group: "inference", label: "NVIDIA API key", secret: true, placeholder: "nvapi-..." },
  { key: "NVIDIA_MODEL", group: "inference", label: "NVIDIA model", placeholder: "nvidia/nemotron-3-super-120b-a12b", hint: "NVIDIA retires models; a 410 Gone means this one has gone. GET /v1/models with your key lists the rest." },
  { key: "OPENROUTER_API_KEY", group: "inference", label: "OpenRouter API key", secret: true, placeholder: "sk-or-..." },
  { key: "OPENROUTER_MODEL", group: "inference", label: "OpenRouter model", placeholder: "anthropic/claude-sonnet-4.5" },
];

const byKey = new Map(FIELDS.map((f) => [f.key, f]));

/**
 * The region is the one setting the server itself reads while running — MCP
 * works out "today" from it — so it is applied at startup and again on save.
 */
export const applyRegion = () =>
  setRegion({
    locale: process.env.LOCALE?.trim() || DEFAULT_REGION.locale,
    timezone: process.env.TIMEZONE?.trim() ?? "",
    currency: process.env.CURRENCY?.trim() || DEFAULT_REGION.currency,
  });

applyRegion();

/** GET /api/settings — the fields, their values, and whether the database answers. */
export async function readSettings(_req: Request, res: Response) {
  const fields = FIELDS.map((field) => {
    const value = process.env[field.key] ?? "";
    return { ...field, value: field.secret ? "" : value, set: !!value };
  });

  res.json({ fields, providers: describeProviders(), chatProvider: currentProvider(), database: await health() });
}

async function health() {
  const target = describeTarget();
  try {
    return { target, ok: true, server: await serverInfo(), counts: await counts() };
  } catch (e) {
    return { target, ok: false, error: (e as Error).message };
  }
}

/** PUT /api/settings — `{ changes: { KEY: value } }`. Unknown keys are refused. */
export function writeSettings(req: Request, res: Response) {
  const changes = (req.body?.changes ?? {}) as Record<string, unknown>;
  const applied: Record<string, string> = {};

  for (const [key, raw] of Object.entries(changes)) {
    const field = byKey.get(key);
    if (!field) return res.status(400).json({ error: `${key} is not a setting.` });

    const value = String(raw ?? "").trim();
    // A blank secret is the browser saying "I was never shown it, keep it".
    if (field.secret && !value) continue;
    if (field.choices && value && !field.choices.includes(value)) {
      return res.status(400).json({ error: `${field.label} must be one of: ${field.choices.join(", ")}.` });
    }
    if (field.valid && value && !field.valid(value)) {
      return res.status(400).json({ error: `${field.label} must be ${field.expected} — "${value}" is not one.` });
    }
    applied[key] = value;
  }

  if (!Object.keys(applied).length) return res.json({ saved: [], restart: [] });

  let before = "";
  try {
    before = readFileSync(envFile(), "utf8");
  } catch {
    // No .env yet — the first save creates it.
  }
  writeFileSync(envFile(), patchEnv(before, applied), "utf8");

  for (const [key, value] of Object.entries(applied)) process.env[key] = value;
  applyRegion();

  res.json({
    saved: Object.keys(applied),
    restart: Object.keys(applied).filter((key) => byKey.get(key)?.restart),
  });
}
