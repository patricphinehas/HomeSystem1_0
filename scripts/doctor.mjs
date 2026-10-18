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
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB = process.env.MONGODB_DB ?? "homesystem";
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

// 3. Dependencies
const needed = ["next", "react", "express", "mongodb", "recharts"];
const missing = needed.filter((p) => !existsSync(`node_modules/${p}`));
missing.length === 0
  ? add("ok", "Dependencies", `${needed.length} key packages present`)
  : add("fail", "Dependencies", `missing ${missing.join(", ")}`, "Run `mise run setup`.");

// 4. MongoDB, and 5. whether it holds anything
const client = new MongoClient(URI, { serverSelectionTimeoutMS: 3000 });
try {
  await client.connect();
  const db = client.db(DB);
  const build = await db.admin().serverInfo();
  add("ok", "MongoDB", `${URI} · v${build.version}`);

  const [categories, bills] = await Promise.all([
    db.collection("categories").countDocuments({}),
    db.collection("bills").countDocuments({}),
  ]);
  categories > 0
    ? add("ok", `Database "${DB}"`, `${categories} categories, ${bills} bills`)
    : add("warn", `Database "${DB}"`, "empty", "Run `mise run seed` to load the starter inventory and demo bills.");
} catch (e) {
  add("fail", "MongoDB", `cannot reach ${URI}`, `Start mongod, or set MONGODB_URI. (${e.message.split("\n")[0]})`);
} finally {
  await client.close().catch(() => {});
}

// 6. Ports
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
