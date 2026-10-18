/** Runs the Next dev server and the bills API together. Ctrl-C stops both. */

import { spawn } from "node:child_process";

// Both are started through this node binary rather than through a shell: on
// Windows, spawning the npx/next .cmd shims without a shell fails with EINVAL.
const procs = [
  spawn(process.execPath, ["--watch", "server/index.ts"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], { stdio: "inherit" }),
];

const stop = (code) => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
};

for (const p of procs) p.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
