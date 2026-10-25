import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blankController,
  blankDevice,
  byRoom,
  cleanControllerUrl,
  describeState,
  fromEdge,
  isControllerUrl,
  isStale,
  modesOf,
  normalizeDevices,
  planCommand,
  setpointRange,
  stateSummary,
  unknownState,
  type Device,
} from "./devices.ts";

const ac = (over: Partial<Device> = {}): Device =>
  blankDevice("d1", { name: "Bedroom AC", kind: "ac", room: "Bedroom", controller: "c1", address: "ac-1", ...over });

const doc = (devices: Partial<Device>[], controllers = [blankController("c1", { name: "Pi", url: "192.168.1.50:8080" })]) =>
  normalizeDevices({ controllers, devices: devices.map((d, i) => ({ ...ac({ id: `d${i + 1}` }), ...d })) });

const ok = (result: ReturnType<typeof normalizeDevices>) => {
  if ("error" in result) throw new Error(`expected a valid registry, got: ${result.error}`);
  return result.doc;
};

test("a controller address gets a scheme, and only a usable one is callable", () => {
  assert.equal(cleanControllerUrl("192.168.1.50:8080"), "http://192.168.1.50:8080");
  assert.equal(cleanControllerUrl("https://pi.local/"), "https://pi.local");
  assert.ok(isControllerUrl("http://192.168.1.50:8080"));
  // A credential in the URL would be a password in the database and in the logs.
  assert.equal(isControllerUrl("http://admin:hunter2@pi.local"), false);
  assert.equal(isControllerUrl("file:///etc/passwd"), false);
  assert.equal(isControllerUrl("javascript:alert(1)"), false);

  // Half-typed addresses are stored, not refused: "http:" is on the way to
  // "http://pi.local", and refusing it would make the field impossible to type
  // in. server/edge.ts is the gate, and such a controller is unreachable.
  const typing = normalizeDevices({ controllers: [blankController("c1", { url: "http:" })], devices: [] });
  assert.ok(!("error" in typing));
  assert.equal(isControllerUrl("http:"), false);
});

test("the registry refuses a device pointing at a controller that is not there", () => {
  const result = normalizeDevices({ controllers: [], devices: [ac()] });
  assert.ok("error" in result && result.error.includes('no controller "c1"'));
});

test("two devices cannot share one address on one controller", () => {
  const result = doc([{ id: "d1", address: "relay-1" }, { id: "d2", address: "relay-1" }]);
  assert.ok("error" in result && result.error.includes("already used"));
});

test("a setpoint range is narrowed into the kind's, never widened", () => {
  // A geyser rated to 60 is not asked for 75 because water heaters go that high.
  const geyser = blankDevice("w1", { kind: "water-heater", maxSetpoint: 60 });
  assert.deepEqual(setpointRange(geyser), { min: 35, max: 60, step: 1 });

  const stored = ok(doc([{ id: "d1", kind: "water-heater", minSetpoint: 10, maxSetpoint: 200 }]));
  assert.equal(stored.devices[0].minSetpoint, 35);
  assert.equal(stored.devices[0].maxSetpoint, 75);

  // A range entered inside out falls back to the kind's rather than refusing
  // every setpoint the page could send.
  assert.deepEqual(setpointRange(blankDevice("x", { kind: "ac", minSetpoint: 28, maxSetpoint: 18 })), {
    min: 16,
    max: 30,
    step: 0.5,
  });
  assert.equal(setpointRange(blankDevice("t1", { kind: "water-tank" })), null);
});

test("a setpoint a device has no room for is clamped, and says so", () => {
  const hot = planCommand(blankDevice("w1", { name: "Geyser", kind: "water-heater" }), { setpoint: 90 });
  assert.deepEqual(hot, { command: { setpoint: 75 }, clamped: true });

  // Rounding to the step is not a clamp — 23.4 is simply 23.5 on this unit.
  assert.deepEqual(planCommand(ac(), { setpoint: 23.4 }), { command: { setpoint: 23.5 }, clamped: false });
});

test("a command is refused when the device has nothing to set", () => {
  const tank = blankDevice("t1", { name: "Overhead tank", kind: "water-tank" });
  const refused = planCommand(tank, { power: true });
  assert.ok("error" in refused && refused.error.includes("no power"));

  const pump = blankDevice("p1", { name: "Pump", kind: "water-pump" });
  assert.ok("error" in planCommand(pump, { setpoint: 40 }));
  assert.deepEqual(planCommand(pump, { power: true }), { command: { power: true }, clamped: false });

  assert.ok("error" in planCommand(ac(), {}));
  assert.ok("error" in planCommand(ac(), { mode: "turbo" }));
  assert.ok("error" in planCommand(ac(), { fan: "hurricane" }));
  assert.deepEqual(planCommand(ac(), { mode: "COOL", fan: "High" }), {
    command: { mode: "cool", fan: "high" },
    clamped: false,
  });
});

test("monitor-only is enforced, not just hidden", () => {
  const watched = ac({ readOnly: true });
  const refused = planCommand(watched, { power: false });
  assert.ok("error" in refused && refused.error.includes("monitor only"));
});

test("a unit's own mode list wins, and a mode its kind lacks is dropped", () => {
  const stored = ok(doc([{ id: "d1", kind: "ac", modes: ["cool", "dry", "nuclear"] }]));
  assert.deepEqual(stored.devices[0].modes, ["cool", "dry"]);
  assert.deepEqual(modesOf(stored.devices[0]), ["cool", "dry"]);
  // Naming none means the kind's whole list, not an air conditioner with no modes.
  assert.deepEqual(modesOf(ac({ modes: [] })), ["cool", "dry", "fan", "heat", "auto"]);
});

test("a reading from the controller is parsed, not trusted", () => {
  const state = fromEdge("d1", { power: "ON", temperature: "26.5", target: 24, mode: "cool", at: "2026-10-26T10:00:00Z" });
  assert.equal(state.power, true);
  assert.equal(state.value, 26.5);
  assert.equal(state.setpoint, 24);

  // Nonsense becomes null, so a card shows "no reading" instead of NaN.
  const junk = fromEdge("d2", { power: "maybe", temperature: "warm", level: null });
  assert.equal(junk.power, null);
  assert.equal(junk.value, null);
  assert.equal(fromEdge("d3", undefined).online, true);
});

test("a reading stops being believed once it is old", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const fresh = fromEdge("d1", { at: "2026-10-26T11:59:00Z" });
  const old = fromEdge("d1", { at: "2026-10-26T11:50:00Z" });
  assert.equal(isStale(fresh, now), false);
  assert.equal(isStale(old, now), true);
  // No timestamp is not a stale timestamp: there is nothing to disbelieve.
  assert.equal(isStale(unknownState("d1"), now), false);
});

test("the summary counts what the house is doing", () => {
  const devices = ok(
    doc([
      { id: "d1", address: "ac-1" },
      { id: "d2", address: "ac-2" },
      { id: "d3", address: "ac-3" },
    ]),
  ).devices;
  const states = {
    d1: fromEdge("d1", { online: true, power: true }),
    d2: fromEdge("d2", { online: true, power: false }),
    d3: fromEdge("d3", { online: false }),
  };
  assert.deepEqual(stateSummary(devices, states), { total: 3, online: 2, offline: 1, on: 1, stale: 0 });
  // A device nothing reported on counts as offline, not as quietly fine.
  assert.deepEqual(stateSummary(devices, {}), { total: 3, online: 0, offline: 3, on: 0, stale: 0 });
});

test("a card's line says offline before it says anything else", () => {
  assert.equal(describeState(ac(), fromEdge("d1", { online: false, power: true })), "Offline");
  assert.equal(describeState(ac(), undefined), "No reading yet");
  assert.equal(
    describeState(ac(), fromEdge("d1", { online: true, power: true, mode: "cool", setpoint: 24, fan: "auto" })),
    "on · cool · 24°C · fan auto",
  );
  // A tank has no controls, so its reading is the whole story.
  const tank = blankDevice("t1", { kind: "water-tank" });
  assert.equal(describeState(tank, fromEdge("t1", { online: true, level: 62 })), "monitor only");
});

test("devices come back grouped by room, unroomed ones together", () => {
  const stored = ok(
    doc([
      { id: "d1", name: "AC", room: "Bedroom", address: "a" },
      { id: "d2", name: "Geyser", kind: "water-heater", room: "", address: "b" },
      { id: "d3", name: "Fan", kind: "switch", room: "Bedroom", address: "c" },
    ]),
  );
  const rooms = byRoom(stored.devices);
  // Rooms alphabetically, the unroomed ones last, and names inside a room.
  assert.deepEqual(
    rooms.map((r) => [r.room, r.devices.map((d) => d.name)]),
    [
      ["Bedroom", ["AC", "Fan"]],
      ["No room", ["Geyser"]],
    ],
  );
});

test("a token is named, never stored", () => {
  const result = normalizeDevices({
    controllers: [blankController("c1", { tokenEnv: "edge token" })],
    devices: [],
  });
  assert.ok("error" in result && result.error.includes("EDGE_TOKEN"));
  const fine = ok(normalizeDevices({ controllers: [blankController("c1", { tokenEnv: "pi_token" })], devices: [] }));
  assert.equal(fine.controllers[0].tokenEnv, "PI_TOKEN");
});
