/**
 * Compiles the parts of this repo that a packaged desktop build has to run as
 * plain JavaScript.
 *
 *   node scripts/build-desktop.mjs
 *
 * `server/` and `lib/` are TypeScript run through Node's type stripping, which
 * is a convenience the repo can rely on and a packaged app should not: the
 * stripping is a Node feature, the desktop runs under Electron's Node, and
 * Next's own custom-server guide is explicit that a custom server file is not
 * compiled by Next either. So they are bundled here, ahead of time, by esbuild.
 *
 * Only this project's own source is bundled. Every bare import — next,
 * express, mongodb, postgres, electron — stays external and is resolved from
 * node_modules at runtime, because `next` in particular loads its own runtime
 * and the build output beside it, and bundling that would be a fight with no
 * prize. Shipping node_modules is the cost of the single-process custom
 * server, and it is a decision recorded in electron_migration.md.
 *
 * Outputs (build/ is ignored by git):
 *   desktop/dist/host.mjs            the pages + API server, runnable with node
 *   desktop/dist/main.mjs    the Electron main process, when desktop/ exists
 *   desktop/dist/preload.cjs the preload, which must be CommonJS under sandbox
 */

import { build } from "esbuild";
import { existsSync, rmSync } from "node:fs";

const shared = {
  bundle: true,
  platform: "node",
  // Electron 44 runs Node 24, and so does this repo (mise.toml pins it).
  target: "node24",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
};

rmSync("desktop/dist", { recursive: true, force: true });

const jobs = [{ entryPoints: ["server/host.ts"], format: "esm", outfile: "desktop/dist/host.mjs", ...shared }];

if (existsSync("desktop/main.ts")) {
  jobs.push({ entryPoints: ["desktop/main.ts"], format: "esm", outfile: "desktop/dist/main.mjs", ...shared });
}
if (existsSync("desktop/preload.ts")) {
  // Preload scripts run in a sandboxed renderer, where only CommonJS loads.
  jobs.push({ entryPoints: ["desktop/preload.ts"], format: "cjs", outfile: "desktop/dist/preload.cjs", ...shared });
}

await Promise.all(jobs.map(build));
console.log(`built ${jobs.map((j) => j.outfile).join(", ")}`);
