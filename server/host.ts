/**
 * The pages and the data API on one port, in one process.
 *
 * `pnpm dev` runs two processes — Next on 3000, Express on 4000 — and Next's
 * rewrites make the browser believe they are one origin. That arrangement is
 * right for development and wrong for a desktop app, where a second process,
 * a second port and a proxy between them are three things that can fail in
 * front of somebody who just opened an application.
 *
 * So: one http server. Anything under /api is the Express app from
 * `server/api.ts`, byte for byte the same routes; everything else is Next's
 * request handler. The rewrites in next.config.ts never fire here, because
 * Express has already answered those paths.
 *
 * Order matters and only in one direction. Next begins writing the response
 * inside its handler, so nothing may set a header after calling it — see
 * Next's custom-server guide. The API runs first, which is also what makes the
 * ordering above correct.
 *
 *   node server/host.ts            port 3000, or PORT
 *   node server/host.ts --dev      the dev server, in-process
 */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import next from "next";
import { createApi } from "./api.ts";
import { describeTarget } from "./db.ts";

export type HostOptions = {
  /** 0 asks the operating system for a free one, which is what the desktop build wants. */
  port?: number;
  /** Loopback by default: this server has no authentication of any kind. */
  hostname?: string;
  /** The Next project directory. Defaults to the working directory. */
  dir?: string;
  dev?: boolean;
  /** next.config, when the caller would rather pass it than have Next find the file. */
  conf?: Parameters<typeof next>[0]["conf"];
};

export type Host = {
  port: number;
  url: string;
  close: () => Promise<void>;
};

const isApi = (url: string | undefined) => url === "/api" || (url?.startsWith("/api/") ?? false);

export async function startHost(options: HostOptions = {}): Promise<Host> {
  const hostname = options.hostname ?? "127.0.0.1";
  const app = next({
    dev: options.dev ?? false,
    dir: options.dir ?? process.cwd(),
    ...(options.conf ? { conf: options.conf } : {}),
  });
  await app.prepare();

  const render = app.getRequestHandler();
  const api = createApi();
  const server = createServer((req, res) => {
    if (isApi(req.url)) return api(req, res);
    render(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, hostname, resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : Number(options.port ?? 0);

  return {
    port,
    url: `http://${hostname}:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await app.close?.();
    },
  };
}

/** Run directly, it is a complete server: `node server/host.ts`. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = await startHost({
    port: Number(process.env.PORT ?? 3000),
    hostname: process.env.HOST ?? "127.0.0.1",
    dev: process.argv.includes("--dev"),
  });
  console.log(`home system on ${host.url} -> ${describeTarget()}`);
}
