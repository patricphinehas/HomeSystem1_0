/**
 * The only code in the project that talks to hardware, and it does not: it
 * talks to an **edge controller** over HTTP and the controller talks to the
 * hardware.
 *
 * The contract a controller has to implement is small enough to write on a
 * Raspberry Pi in an afternoon, and `scripts/edge-sim.mjs` is a working
 * implementation of exactly this, so the whole feature can be driven without
 * owning a single relay:
 *
 *   GET  <url>/health
 *     -> { ok: true, name?: string, version?: string }
 *
 *   GET  <url>/state
 *     -> { devices: [ { address, online?, power?, value?|temperature?|level?,
 *                       setpoint?|target?, mode?, fan?, watts?, at? } ] }
 *     Everything but `address` is optional: a controller reports what it knows
 *     and `fromEdge` in lib/devices.ts fills the rest in as null.
 *
 *   POST <url>/command   { address, power?, setpoint?, mode?, fan? }
 *     -> { ok: true, state?: { ...one device reading... } }
 *     The body is already validated against the device by `planCommand`; a
 *     controller is free to refuse anyway, with { ok: false, error }.
 *
 * Authentication is a bearer token read from the environment at request time,
 * named per controller by `tokenEnv` — so the secret is in `.env` beside the
 * database password, never in the database and never in the browser.
 *
 * ponytail: no retries, no circuit breaker, no queue. A failed command is
 * reported to whoever asked and they press the button again, which is what a
 * person does with a light switch anyway. Retrying a physical action
 * automatically is how a pump runs twice; if a controller ever needs
 * at-least-once delivery, that belongs on the controller with an idempotency
 * key, not here.
 */

import {
  fromEdge,
  isControllerUrl,
  type Command,
  type Controller,
  type ControllerHealth,
  type Device,
  type DeviceState,
  type DevicesDoc,
  type HomeState,
} from "../lib/devices.ts";

/** How long to wait on a controller. A box on the LAN answers in milliseconds. */
const TIMEOUT_MS = Number(process.env.EDGE_TIMEOUT_MS ?? 4000);

/**
 * How long a `/state` answer is reused. The page polls every few seconds and
 * three widgets may ask at once; one controller should not be hit three times
 * for the same reading. Short enough that a command's effect still shows up on
 * the next poll.
 */
const CACHE_MS = Number(process.env.EDGE_CACHE_MS ?? 1500);

const target = (controller: Controller) => {
  try {
    const url = new URL(controller.url);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return controller.url || "no address";
  }
};

const tokenFor = (controller: Controller) =>
  controller.tokenEnv ? (process.env[controller.tokenEnv] ?? "").trim() : "";

/** One request to one controller. Never throws; the caller gets the reason. */
async function ask<T>(
  controller: Controller,
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<{ ok: true; data: T; ms: number } | { ok: false; error: string; ms: number }> {
  const started = Date.now();
  if (!controller.url) return { ok: false, error: "No address configured.", ms: 0 };
  // The registry stores an address as typed, so this is the gate: http(s)
  // only, and never credentials in the URL — which would put a password in
  // the database and in every log line that prints the target.
  if (!isControllerUrl(controller.url)) {
    return {
      ok: false,
      error: `"${controller.url}" is not a usable address — it has to be http:// or https:// with no password in it.`,
      ms: 0,
    };
  }

  const token = tokenFor(controller);
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init) headers["content-type"] = "application/json";

  try {
    const response = await fetch(`${controller.url}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A controller that answers with a redirect is misconfigured, and
      // following one could send the token somewhere else entirely.
      redirect: "manual",
    });
    const ms = Date.now() - started;
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      const why =
        response.status === 401 || response.status === 403
          ? `Refused the token (${response.status}) — check ${controller.tokenEnv || "the token"} in .env.`
          : `Answered ${response.status} ${response.statusText}.`;
      return { ok: false, error: body?.error ? `${why} (${body.error})` : why, ms };
    }
    return { ok: true, data: body as T, ms };
  } catch (e) {
    return { ok: false, error: reason(e as Error, controller), ms: Date.now() - started };
  }
}

/**
 * Why a call did not land, in words that say what to do about it. Node's fetch
 * reports every one of these as "fetch failed" and hides the real code in
 * `cause`, which is useless on a page: a controller that is switched off and
 * one whose address has a typo need different answers, and "fetch failed" is
 * neither. The same reasoning as the database errors in server/index.ts.
 */
function reason(err: Error, controller: Controller) {
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return `No answer in ${TIMEOUT_MS}ms — the controller is reachable but did not reply.`;
  }
  const code = String((err as { cause?: { code?: string } }).cause?.code ?? "");
  const where = target(controller);
  if (code === "ECONNREFUSED") return `Nothing is listening at ${where}.`;
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return `${where} cannot be reached from this machine.`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `${where} does not resolve to an address.`;
  if (code === "ECONNRESET") return `${where} closed the connection.`;
  if (code === "CERT_HAS_EXPIRED" || code.startsWith("ERR_TLS")) return `Its certificate was refused (${code}).`;
  return code ? `${err.message} (${code}).` : `${err.message}.`;
}

type EdgeDeviceRow = Record<string, unknown> & { address?: unknown; kind?: unknown };

const rowsOf = (data: unknown): EdgeDeviceRow[] => {
  const devices = (data as { devices?: unknown } | null)?.devices;
  return Array.isArray(devices) ? (devices as EdgeDeviceRow[]) : [];
};

const addressOf = (row: EdgeDeviceRow) => String(row.address ?? row.id ?? "").trim();

let cached: { at: number; value: HomeState } | null = null;

/**
 * Ask every controller what it knows and key it by the registry's device ids.
 * Controllers are asked in parallel and one that is unreachable does not stop
 * the others: its devices simply have no reading, and the page says which
 * controller is down rather than showing a houseful of dead cards.
 */
export async function readHomeState(doc: DevicesDoc, now = Date.now()): Promise<HomeState> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const answers = await Promise.all(
    doc.controllers.map(async (controller) => ({ controller, answer: await ask<unknown>(controller, "/state") })),
  );

  const controllers: ControllerHealth[] = [];
  const states: Record<string, DeviceState> = {};
  const discovered: HomeState["discovered"] = [];

  for (const { controller, answer } of answers) {
    const mine = doc.devices.filter((d) => d.controller === controller.id);
    const rows = answer.ok ? rowsOf(answer.data) : [];
    const byAddress = new Map(rows.map((row) => [addressOf(row), row]));

    controllers.push({
      id: controller.id,
      name: controller.name || controller.id,
      target: target(controller),
      ok: answer.ok,
      ms: answer.ms,
      devices: rows.length,
      authed: !!tokenFor(controller),
      ...(answer.ok ? {} : { error: answer.error }),
    });

    for (const device of mine) {
      const row = byAddress.get(device.address);
      if (!row) continue;
      states[device.id] = fromEdge(device.id, row);
      byAddress.delete(device.address);
    }

    for (const [address, row] of byAddress) {
      if (!address) continue;
      discovered.push({ controller: controller.id, address, kindHint: String(row.kind ?? "").slice(0, 20) });
    }
  }

  const value: HomeState = { controllers, states, discovered, at: new Date(now).toISOString() };
  cached = { at: now, value };
  return value;
}

/**
 * Send one already-validated command. The controller's own reading of the
 * device comes back when it offers one, so the page can show what actually
 * happened rather than what was asked for — an air conditioner behind an IR
 * blaster often cannot confirm anything, and saying so is better than drawing
 * a switch as "on" because somebody pressed it.
 */
export async function sendCommand(
  controller: Controller,
  device: Device,
  command: Command,
): Promise<{ ok: true; state: DeviceState | null } | { ok: false; error: string }> {
  const answer = await ask<{ ok?: boolean; error?: string; state?: unknown }>(controller, "/command", {
    method: "POST",
    body: { address: device.address, ...command },
  });
  if (!answer.ok) return { ok: false, error: `${controller.name || controller.id}: ${answer.error}` };
  if (answer.data && answer.data.ok === false) {
    return { ok: false, error: answer.data.error || "The controller refused the command." };
  }
  // The next /state has to see the command's effect, not the cached reading
  // from before it.
  cached = null;
  return { ok: true, state: answer.data?.state ? fromEdge(device.id, answer.data.state) : null };
}

/** One controller's /health, for the setup page's Test button. */
export async function checkController(controller: Controller) {
  const answer = await ask<{ ok?: boolean; name?: string; version?: string }>(controller, "/health");
  return {
    id: controller.id,
    target: target(controller),
    authed: !!tokenFor(controller),
    tokenEnv: controller.tokenEnv,
    ms: answer.ms,
    ...(answer.ok
      ? { ok: answer.data?.ok !== false, name: answer.data?.name ?? "", version: answer.data?.version ?? "" }
      : { ok: false, error: answer.error }),
  };
}

/** Drops the cached /state. Used after the registry changes under us. */
export const forgetHomeState = () => {
  cached = null;
};
