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
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { patchEnv } from "../lib/env-file.ts";
import { DB_CHOICES } from "./db-select.ts";
import { PROVIDERS, currentProvider, describeProviders } from "./chat.ts";
import { counts, describeTarget, serverInfo } from "./db.ts";

const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

type Field = {
  key: string;
  group: "user" | "database" | "inference";
  label: string;
  hint?: string;
  /** Never sent to the browser; an empty value on a save means "leave it". */
  secret?: boolean;
  /** Read once at startup, so a change only takes effect after a restart. */
  restart?: boolean;
  choices?: readonly string[];
  placeholder?: string;
};

export const FIELDS: Field[] = [
  { key: "USER_NAME", group: "user", label: "Your name", placeholder: "Who is using this", hint: "Shown in the header and used as the default bill holder." },
  { key: "HOUSEHOLD_NAME", group: "user", label: "Household", placeholder: "Home System" },

  { key: "DB_SELECT", group: "database", label: "Database", choices: DB_CHOICES, hint: "Switches immediately — the other database has to be configured and running." },
  { key: "MONGODB_URI", group: "database", label: "MongoDB URI", secret: true, restart: true, placeholder: "mongodb://127.0.0.1:27017" },
  { key: "MONGODB_DB", group: "database", label: "MongoDB database", restart: true, placeholder: "homesystem" },
  { key: "DATABASE_URL", group: "database", label: "Postgres / Supabase URL", secret: true, restart: true, hint: "Use the pooler host on port 6543; URL-encode the password." },

  { key: "CHAT_PROVIDER", group: "inference", label: "Inference engine", choices: Object.keys(PROVIDERS) },
  { key: "OLLAMA_URL", group: "inference", label: "Ollama host", placeholder: "http://127.0.0.1:11434" },
  { key: "OLLAMA_MODEL", group: "inference", label: "Ollama model", placeholder: "llama3.1", hint: "Needs a model that supports tool calling." },
  { key: "NVIDIA_API_KEY", group: "inference", label: "NVIDIA API key", secret: true, placeholder: "nvapi-..." },
  { key: "NVIDIA_MODEL", group: "inference", label: "NVIDIA model", placeholder: "nvidia/llama-3.3-nemotron-super-49b-v1.5" },
  { key: "OPENROUTER_API_KEY", group: "inference", label: "OpenRouter API key", secret: true, placeholder: "sk-or-..." },
  { key: "OPENROUTER_MODEL", group: "inference", label: "OpenRouter model", placeholder: "anthropic/claude-sonnet-4.5" },
];

const byKey = new Map(FIELDS.map((f) => [f.key, f]));

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
    applied[key] = value;
  }

  if (!Object.keys(applied).length) return res.json({ saved: [], restart: [] });

  let before = "";
  try {
    before = readFileSync(ENV_FILE, "utf8");
  } catch {
    // No .env yet — the first save creates it.
  }
  writeFileSync(ENV_FILE, patchEnv(before, applied), "utf8");

  for (const [key, value] of Object.entries(applied)) process.env[key] = value;

  res.json({
    saved: Object.keys(applied),
    restart: Object.keys(applied).filter((key) => byKey.get(key)?.restart),
  });
}
