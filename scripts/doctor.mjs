/**
 * Checks everything the app needs before it will run: the toolchain, the
 * dependencies, a reachable database, whether it has been seeded, and whether
 * the two ports are free.
 *
 *   mise run doctor   (or: node scripts/doctor.mjs)
 *
 * Exits 1 if something is actually missing. A warning — not seeded yet, a port
 * already in use — reports but does not fail, because both are often fine.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { close, counts, describeTarget, sql } from "../server/db.ts";

const API_PORT = Number(process.env.API_PORT ?? 4000);
const WEB_PORT = Number(process.env.PORT ?? 3000);

/** Node must be new enough to run .ts files directly (type stripping). */
const MIN_NODE = [22, 18, 0];

const results = [];
const add = (state, name, detail, hint) => results.push({ state, name, detail, hint });

const atLeast = (version, min) => {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < min.length; i++) {
    if (parts[i] > min[i]) return true;
    if (parts[i] < min[i]) return false;
  }
  return true;
};

// 1. Node
atLeast(process.versions.node, MIN_NODE)
  ? add("ok", "Node", `v${process.versions.node}`)
  : add(
      "fail",
      "Node",
      `v${process.versions.node}, needs v${MIN_NODE.join(".")}+`,
      "The server and scripts are TypeScript run without a build step, which needs Node 22.18+. `mise install` picks up the pinned version.",
    );

// 2. pnpm, against the version package.json pins
// One string, not argv: passing args alongside shell:true is deprecated.
const pnpm = spawnSync("pnpm --version", { encoding: "utf8", shell: true });
const pinned = (() => {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).packageManager ?? "";
  } catch {
    return "";
  }
})();
if (pnpm.status === 0) {
  const found = pnpm.stdout.trim();
  const want = pinned.split("@")[1];
  want && !want.startsWith(found.split(".")[0])
    ? add("warn", "pnpm", `v${found}, package.json pins ${pinned}`, "Mostly harmless, but a major mismatch can rewrite the lockfile.")
    : add("ok", "pnpm", `v${found}`);
} else {
  add("fail", "pnpm", "not on PATH", "Install it (`mise install`, or `corepack enable pnpm`), then run `mise run setup`.");
}

// 3. Configuration
existsSync(".env")
  ? add("ok", "Config", ".env loaded")
  : add(
      "warn",
      "Config",
      "no .env, using built-in defaults",
      "Copy .env.example to .env to point the app at a different database or port.",
    );

// 4. Dependencies
const needed = ["next", "react", "express", "postgres", "recharts"];
const missing = needed.filter((p) => !existsSync(`node_modules/${p}`));
missing.length === 0
  ? add("ok", "Dependencies", `${needed.length} key packages present`)
  : add("fail", "Dependencies", `missing ${missing.join(", ")}`, "Run `mise run setup`.");

// 5. Supabase, 6. the schema, and whether it holds anything
if (!process.env.DATABASE_URL) {
  add(
    "fail",
    "Supabase",
    "DATABASE_URL is not set",
    "Supabase dashboard → Project Settings → Database → Connection string → URI, then paste it into .env.",
  );
} else {
  try {
    const [{ version }] = await sql()`select version()`;
    add("ok", "Supabase", `${describeTarget()} · ${version.split(" ").slice(0, 2).join(" ")}`);

    try {
      const n = await counts();
      n.categories > 0
        ? add("ok", "Data", `${n.categories} categories, ${n.items} items, ${n.bills} bills`)
        : add("warn", "Data", "tables are empty", "Run `mise run seed` to load the starter inventory and demo bills.");
    } catch (e) {
      e.code === "42P01"
        ? add("fail", "Schema", "tables are missing", "Run `mise run migrate` to apply supabase/schema.sql.")
        : add("fail", "Schema", e.message.split("\n")[0]);
    }
  } catch (e) {
    add("fail", "Supabase", `cannot reach ${describeTarget()}`, e.message.split("\n")[0]);
  } finally {
    await close().catch(() => {});
  }
}

// 7. Ports
const portFree = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    // Wildcard, the way the servers bind. Binding 127.0.0.1 instead succeeds
    // on Windows even when something already holds 0.0.0.0, which would report
    // a busy port as free.
    server.listen(port);
  });

for (const [port, what] of [
  [WEB_PORT, "pages"],
  [API_PORT, "data API"],
]) {
  (await portFree(port))
    ? add("ok", `Port ${port}`, `free, for the ${what}`)
    : add("warn", `Port ${port}`, "in use", `Something is already listening — probably the ${what} from an earlier \`mise run develop\`.`);
}

// Report
const mark = { ok: "✓", warn: "!", fail: "✗" };
const width = Math.max(...results.map((r) => r.name.length));
console.log("");
for (const r of results) {
  console.log(`  ${mark[r.state]}  ${r.name.padEnd(width)}  ${r.detail}`);
  if (r.hint && r.state !== "ok") console.log(`     ${" ".repeat(width)}  ${r.hint}`);
}

const failed = results.filter((r) => r.state === "fail").length;
const warned = results.filter((r) => r.state === "warn").length;
console.log(
  `\n  ${failed ? `${failed} problem${failed > 1 ? "s" : ""} to fix` : "ready to run"}` +
    `${warned ? `, ${warned} warning${warned > 1 ? "s" : ""}` : ""}` +
    `${failed ? "" : " — `mise run develop`"}\n`,
);

process.exit(failed ? 1 : 0);
