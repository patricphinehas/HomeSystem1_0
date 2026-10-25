/**
 * The data API as its own process, on API_PORT (default 4000) — what
 * `pnpm dev` and `pnpm api` run, and what a hosted deployment would run.
 *
 * The routes themselves are in `server/api.ts`, because the desktop build
 * mounts the same app in front of Next on a single port instead of starting a
 * second process for it. This file is the listener and nothing else.
 */

import { createApi } from "./api.ts";
import { describeTarget } from "./db.ts";

const port = Number(process.env.API_PORT ?? 4000);
createApi().listen(port, () => console.log(`data api on http://localhost:${port} -> ${describeTarget()}`));
