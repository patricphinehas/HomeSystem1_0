/**
 * Where the files this server reads and writes actually live.
 *
 * Three of them are neither code nor rows in the database: `.env`, which the
 * settings page writes; `.mcp.json`, the MCP servers this app itself talks to;
 * and `sqlite/schema.sql`, applied when a SQLite file is first opened. All
 * three default to the repo layout resolved from this module, which is what
 * every command in package.json has always done.
 *
 * A packaged desktop build overrides them, because the program directory
 * inside an installer is read-only and the household's settings belong in the
 * per-user data directory. The overrides are environment variables rather than
 * arguments so nothing above has to thread a config object down through the
 * API, the drivers and the MCP endpoint: the process that starts the server
 * sets them, and everything below reads the same answer.
 *
 * They are read on each call rather than once at import, so a launcher that
 * sets them late is still obeyed.
 */

import { fileURLToPath } from "node:url";

const override = (key: string) => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

const beside = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** The `.env` the settings page reads and writes. Must be writable. */
export const envFile = () => override("HOME_SYSTEM_ENV_FILE") ?? beside("../.env");

/** The MCP servers this app talks to. Read-only, and absent is normal. */
export const mcpFile = () => override("HOME_SYSTEM_MCP_FILE") ?? beside("../.mcp.json");

/** The SQLite tables. Read-only, so it can stay inside a packaged archive. */
export const sqliteSchemaFile = () => override("HOME_SYSTEM_SQLITE_SCHEMA") ?? beside("../sqlite/schema.sql");
