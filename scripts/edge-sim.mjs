/**
 * A pretend edge controller: the smallest thing that satisfies the contract in
 * server/edge.ts, with a crude physical model behind it so the devices actually
 * respond to being switched on.
 *
 *   pnpm edge                 (or: node scripts/edge-sim.mjs)
 *   EDGE_PORT=8099 EDGE_TOKEN=secret node scripts/edge-sim.mjs
 *
 * It exists for two reasons. It makes /devices demonstrable without owning a
 * relay — point a controller at http://127.0.0.1:8099 and the house comes
 * alive. And it is the reference: a real controller on a Raspberry Pi has to
 * answer these three routes and nothing else, so this file is the spec a
 * household's own hardware is written against. Everything vendor-specific —
 * Zigbee, Tuya, Modbus, an IR blaster, a GPIO relay — replaces the `tick`
 * function and the two handlers, not the protocol.
 *
 * No dependencies and no state on disk: it is node:http and a Map, so it can be
 * copied onto a Pi on its own. Nothing here is the app's code — the app only
 * ever sees the JSON.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.EDGE_PORT ?? 8099);
/** Set it and every request needs `authorization: Bearer <token>`. */
const TOKEN = (process.env.EDGE_TOKEN ?? "").trim();
const NAME = process.env.EDGE_NAME ?? "edge-sim";

/**
 * The devices this controller claims to own. `address` is what the app's
 * registry points at; `kind` is only a hint, so the app's setup page can
 * suggest something when it offers a discovered device.
 */
const devices = new Map(
  [
    { address: "ac-bedroom", kind: "ac", power: false, value: 29.4, setpoint: 24, mode: "cool", fan: "auto", watts: 0 },
    { address: "ac-living", kind: "ac", power: false, value: 30.1, setpoint: 25, mode: "cool", fan: "low", watts: 0 },
    { address: "geyser-bath", kind: "water-heater", power: false, value: 31, setpoint: 55, watts: 0 },
    { address: "pump-sump", kind: "water-pump", power: false, watts: 0 },
    { address: "tank-overhead", kind: "water-tank", value: 62 },
    { address: "plug-filter", kind: "switch", power: true, watts: 18 },
    { address: "probe-outside", kind: "sensor", value: 31.8 },
  ].map((device) => [device.address, { ...device, at: new Date().toISOString() }]),
);

/** Ambient, which is what everything drifts back towards when it is off. */
const OUTSIDE = 31.5;

const toward = (value, target, rate) => value + (target - value) * rate;
const round = (value) => Math.round(value * 10) / 10;

/**
 * One second of physics, roughly. Not a simulation anybody should trust — it
 * exists so that pressing a button on the page visibly changes a number a few
 * seconds later, which is the only behaviour the app's polling needs to show.
 */
function tick() {
  const tank = devices.get("tank-overhead");
  const pump = devices.get("pump-sump");

  for (const device of devices.values()) {
    switch (device.kind) {
      case "ac": {
        // A unit that is off creeps back to ambient; running, it approaches its
        // setpoint and draws roughly what the compressor is working at.
        const target = device.power && device.mode !== "fan" ? device.setpoint : OUTSIDE;
        const rate = device.power ? 0.06 : 0.01;
        device.value = round(toward(device.value, target, rate));
        const gap = Math.abs(device.value - device.setpoint);
        device.watts = device.power ? Math.round(300 + Math.min(gap, 6) * 180) : 0;
        break;
      }
      case "water-heater": {
        const target = device.power ? device.setpoint : OUTSIDE;
        device.value = round(toward(device.value, target, device.power ? 0.03 : 0.004));
        // The element cuts out within a degree of the setpoint, like a thermostat.
        device.watts = device.power && device.setpoint - device.value > 1 ? 2000 : 0;
        break;
      }
      case "water-pump": {
        device.watts = device.power ? 750 : 0;
        break;
      }
      case "water-tank": {
        // A house uses water; the pump puts it back faster than that.
        const next = device.value - 0.05 + (pump?.power ? 0.6 : 0);
        device.value = round(Math.min(100, Math.max(0, next)));
        break;
      }
      case "sensor": {
        device.value = round(device.value + (Math.random() - 0.5) * 0.2);
        break;
      }
      default:
        break;
    }
    device.at = new Date().toISOString();
  }

  // A full tank stops the pump, which is what a float switch does and what
  // keeps this from overflowing while nobody is looking at the page.
  if (pump?.power && tank && tank.value >= 100) pump.power = false;
}

setInterval(tick, 1000).unref?.();

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** Only what the contract exposes: no names, no secrets, no extra fields. */
const reading = (device) => ({
  address: device.address,
  kind: device.kind,
  online: true,
  ...(device.power === undefined ? {} : { power: device.power }),
  ...(device.value === undefined ? {} : { value: device.value }),
  ...(device.setpoint === undefined ? {} : { setpoint: device.setpoint }),
  ...(device.mode === undefined ? {} : { mode: device.mode }),
  ...(device.fan === undefined ? {} : { fan: device.fan }),
  ...(device.watts === undefined ? {} : { watts: device.watts }),
  at: device.at,
});

const body = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(null);
      }
    });
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    return json(res, 401, { ok: false, error: "Bad or missing bearer token." });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, name: NAME, version: "0.1.0", devices: devices.size });
  }

  if (req.method === "GET" && url.pathname === "/state") {
    return json(res, 200, { devices: [...devices.values()].map(reading) });
  }

  if (req.method === "POST" && url.pathname === "/command") {
    const sent = await body(req);
    if (!sent) return json(res, 400, { ok: false, error: "Body is not JSON." });

    const device = devices.get(String(sent.address ?? ""));
    if (!device) return json(res, 404, { ok: false, error: `No device at "${sent.address}".` });

    // The app has already checked the command against the device, but a real
    // controller is the thing holding the hardware and gets the last word.
    if (sent.power !== undefined) {
      if (device.power === undefined) return json(res, 400, { ok: false, error: "That device has no switch." });
      device.power = !!sent.power;
    }
    if (sent.setpoint !== undefined) {
      if (device.setpoint === undefined) return json(res, 400, { ok: false, error: "That device has no setpoint." });
      device.setpoint = Number(sent.setpoint);
    }
    if (sent.mode !== undefined && device.mode !== undefined) device.mode = String(sent.mode);
    if (sent.fan !== undefined && device.fan !== undefined) device.fan = String(sent.fan);

    device.at = new Date().toISOString();
    console.log(`command ${device.address}:`, JSON.stringify(sent));
    return json(res, 200, { ok: true, state: reading(device) });
  }

  json(res, 404, { ok: false, error: `Nothing at ${req.method} ${url.pathname}.` });
});

server.listen(PORT, () => {
  console.log(`edge simulator on http://127.0.0.1:${PORT} — ${devices.size} devices${TOKEN ? ", token required" : ""}`);
  console.log("add a controller on /devices -> Setup pointing at that address, then press Test.");
});
