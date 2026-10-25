/**
 * The smart-home registry: what the house can control, and the rules for
 * controlling it. Pure functions only — reaching the hardware is server/edge.ts.
 *
 * Nothing here talks to a device. Every device belongs to an **edge
 * controller**: one box on the local network (a Pi, an ESP32 gateway, Home
 * Assistant, whatever) that already speaks the protocol the device wants —
 * Zigbee, Tuya cloud, Modbus, an IR blaster, a relay on a GPIO pin — and
 * exposes the small HTTP contract in `server/edge.ts` on top. The app
 * therefore has one integration to maintain instead of one per vendor, device
 * credentials never reach the browser, and a protocol change is a change on
 * the controller rather than in here.
 *
 * ponytail: polling, not subscriptions. The pages ask for state every few
 * seconds and the controller answers with everything it knows. An MQTT or
 * WebSocket feed would be fewer bytes and faster to react, but it needs a
 * connection held open through the API, a broker to run, and reconnection
 * logic — and a thermostat reading that is five seconds old is not something
 * anybody in a house can notice. `GET /state` is already the shape a push feed
 * would deliver, so that upgrade is a transport change and not a data one.
 *
 * ponytail: a setpoint, a mode and a fan speed is the whole control surface.
 * Swing direction, sleep timers, eco modes and "turbo" differ per vendor and
 * mostly reduce to one of those three; a schedule is the calendar's job and not
 * a device's. The capability table below is where a fourth control would be
 * declared, and `planCommand` is the only thing that would have to learn it.
 */

export type DeviceKind = "ac" | "thermostat" | "water-heater" | "water-pump" | "water-tank" | "switch" | "sensor";

/** What a device will take an instruction about. */
export type Control = "power" | "setpoint" | "mode" | "fan";

/** What the big number on a device card means. */
export type Reading = "temperature" | "level" | "none";

export type KindSpec = {
  label: string;
  /** Which controls the page offers and the API will accept. */
  controls: readonly Control[];
  reading: Reading;
  /** The unit that reading is in. Empty when there is nothing to read. */
  unit: string;
  /** The default range for a setpoint. A device may narrow it, never widen it. */
  setpoint: { min: number; max: number; step: number } | null;
  modes: readonly string[];
  fans: readonly string[];
  /** What this kind is for, on the setup form. */
  hint: string;
};

/**
 * One row per kind of thing a house has. A device's capabilities are read from
 * here and never from the controller: what the app is willing to send has to be
 * decidable without the network, or a page cannot draw its own controls while
 * the controller is unreachable.
 */
export const KINDS: Record<DeviceKind, KindSpec> = {
  ac: {
    label: "Air conditioner",
    controls: ["power", "setpoint", "mode", "fan"],
    reading: "temperature",
    unit: "°C",
    setpoint: { min: 16, max: 30, step: 0.5 },
    modes: ["cool", "dry", "fan", "heat", "auto"],
    fans: ["auto", "low", "medium", "high"],
    hint: "Split or window unit behind an IR blaster or a Wi-Fi module.",
  },
  thermostat: {
    label: "Thermostat",
    controls: ["power", "setpoint", "mode"],
    reading: "temperature",
    unit: "°C",
    setpoint: { min: 5, max: 35, step: 0.5 },
    modes: ["heat", "cool", "auto"],
    fans: [],
    hint: "Room or zone thermostat driving a boiler, a radiator valve or an air handler.",
  },
  "water-heater": {
    label: "Water heater",
    controls: ["power", "setpoint"],
    reading: "temperature",
    unit: "°C",
    // 60°C is the usual legionella guidance and 75 is about where a domestic
    // element stops. A unit rated lower narrows this in its own row.
    setpoint: { min: 35, max: 75, step: 1 },
    modes: [],
    fans: [],
    hint: "Geyser or immersion heater on a relay, with a tank probe.",
  },
  "water-pump": {
    label: "Water pump",
    controls: ["power"],
    reading: "none",
    unit: "",
    setpoint: null,
    modes: [],
    fans: [],
    hint: "Borewell or sump pump on a contactor. Pair it with a tank sensor.",
  },
  "water-tank": {
    label: "Water tank",
    controls: [],
    reading: "level",
    unit: "%",
    setpoint: null,
    modes: [],
    fans: [],
    hint: "Level sensor on an overhead or underground tank. Monitor only.",
  },
  switch: {
    label: "Switch",
    controls: ["power"],
    reading: "none",
    unit: "",
    setpoint: null,
    modes: [],
    fans: [],
    hint: "A smart plug or relay — a light, a fan, a filter, anything on or off.",
  },
  sensor: {
    label: "Sensor",
    controls: [],
    reading: "temperature",
    unit: "°C",
    setpoint: null,
    modes: [],
    fans: [],
    hint: "A temperature probe with nothing to switch. Monitor only.",
  },
};

export const DEVICE_KINDS = Object.keys(KINDS) as DeviceKind[];

export const isDeviceKind = (value: unknown): value is DeviceKind => typeof value === "string" && value in KINDS;

export const kindLabel = (kind: DeviceKind) => KINDS[kind].label;

/**
 * One edge controller. The URL is data, because it is the household's own
 * network and changes when the Pi moves; the token is not — `tokenEnv` names an
 * environment variable the API reads at request time, so the secret never sits
 * in the database and never reaches the browser.
 */
export type Controller = {
  id: string;
  name: string;
  /** An http(s) origin, optionally with a path prefix: http://192.168.1.50:8080. */
  url: string;
  /** Which .env key holds its bearer token. Empty means the controller is open. */
  tokenEnv: string;
  notes: string;
};

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  room: string;
  /** Which controller owns it. */
  controller: string;
  /** How that controller names it: a topic, an entity id, a relay number. */
  address: string;
  /**
   * The range this particular unit will accept, inside its kind's. A geyser
   * rated to 60 is not asked for 75 just because water heaters go that high.
   */
  minSetpoint: number | null;
  maxSetpoint: number | null;
  /** Which of the kind's modes this unit has. Empty means all of them. */
  modes: string[];
  /** Watch it, never switch it. Enforced by `planCommand`, not merely hidden. */
  readOnly: boolean;
};

export type DevicesDoc = { controllers: Controller[]; devices: Device[] };

export const MAX_CONTROLLERS = 10;
export const MAX_DEVICES = 200;

/** How long a reading stays believable before the page calls it stale. */
export const STALE_AFTER_SECONDS = 120;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* ---------------- what a device can do ---------------- */

export const controlsOf = (device: Pick<Device, "kind" | "readOnly">): readonly Control[] =>
  device.readOnly ? [] : KINDS[device.kind].controls;

export const can = (device: Pick<Device, "kind" | "readOnly">, control: Control) =>
  controlsOf(device).includes(control);

/** The range to offer for this unit: its own, narrowed into its kind's. */
export function setpointRange(device: Pick<Device, "kind" | "minSetpoint" | "maxSetpoint">) {
  const spec = KINDS[device.kind].setpoint;
  if (!spec) return null;
  const min = Math.max(spec.min, device.minSetpoint ?? spec.min);
  const max = Math.min(spec.max, device.maxSetpoint ?? spec.max);
  // A range configured inside out would otherwise refuse every setpoint.
  return min <= max ? { min, max, step: spec.step } : spec;
}

/** Which modes this unit has: its own list, or the kind's when it names none. */
export const modesOf = (device: Pick<Device, "kind" | "modes">) => {
  const all = KINDS[device.kind].modes;
  const own = device.modes.filter((m) => all.includes(m));
  return own.length ? own : all;
};

export const fansOf = (device: Pick<Device, "kind">) => KINDS[device.kind].fans;

/* ---------------- live state ---------------- */

/**
 * What a controller says about one device. Every field is nullable because a
 * controller reports what it knows: a tank has no setpoint, an IR-driven air
 * conditioner cannot be asked whether it is actually on, and a device that has
 * gone quiet has nothing to say at all.
 */
export type DeviceState = {
  deviceId: string;
  online: boolean;
  power: boolean | null;
  /** The reading in the kind's unit: room or water temperature, tank level. */
  value: number | null;
  setpoint: number | null;
  mode: string;
  fan: string;
  /** Power draw in watts, when the controller measures it. */
  watts: number | null;
  /** ISO timestamp of the reading, as the controller gave it. */
  at: string;
};

const numberOr = (v: unknown, fallback: number | null = null) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

const boolOr = (v: unknown) => {
  if (typeof v === "boolean") return v;
  if (v === "on" || v === "ON" || v === 1 || v === "1" || v === "true") return true;
  if (v === "off" || v === "OFF" || v === 0 || v === "0" || v === "false") return false;
  return null;
};

/**
 * One reported reading, widened into a full state. The controller is on the
 * household's own network but it is still the far side of a wire: everything is
 * parsed, nothing is trusted to be the type it should be, and anything missing
 * becomes null rather than NaN or undefined on the page.
 */
export function fromEdge(deviceId: string, raw: unknown): DeviceState {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    deviceId,
    // A controller that lists a device without saying is telling us it is there.
    online: boolOr(row.online) ?? true,
    power: boolOr(row.power),
    value: numberOr(row.value ?? row.temperature ?? row.level),
    setpoint: numberOr(row.setpoint ?? row.target),
    mode: text(row.mode).slice(0, 20),
    fan: text(row.fan).slice(0, 20),
    watts: numberOr(row.watts ?? row.power_w),
    at: text(row.at ?? row.updatedAt),
  };
}

/** A device nothing has reported on: configured, but never heard from. */
export const unknownState = (deviceId: string): DeviceState => ({
  deviceId,
  online: false,
  power: null,
  value: null,
  setpoint: null,
  mode: "",
  fan: "",
  watts: null,
  at: "",
});

/**
 * Whether a reading is old enough to stop believing. A controller that answers
 * but has not heard from a device in two minutes is reporting a memory, and a
 * memory shown as a live temperature is how somebody decides the house is cool
 * when the air conditioner tripped an hour ago.
 */
export function isStale(state: DeviceState, now = Date.now(), seconds = STALE_AFTER_SECONDS) {
  if (!state.at) return false; // Nothing claimed, nothing to disbelieve.
  const at = Date.parse(state.at);
  if (!Number.isFinite(at)) return false;
  return now - at > seconds * 1000;
}

/** The one line the overview and /control show: how the house is doing. */
export function stateSummary(devices: Device[], states: Record<string, DeviceState>, now = Date.now()) {
  let online = 0;
  let on = 0;
  let stale = 0;
  for (const device of devices) {
    const state = states[device.id];
    if (!state) continue;
    if (state.online) online++;
    if (state.power === true) on++;
    if (state.online && isStale(state, now)) stale++;
  }
  return { total: devices.length, online, offline: devices.length - online, on, stale };
}

/**
 * How one controller answered, as the pages show it. Health belongs to the
 * reading and not to the registry: whether the kitchen Pi is up is true for a
 * moment, like a temperature, and the registry row is configuration.
 */
export type ControllerHealth = {
  id: string;
  name: string;
  /** Host and port only — never a token, never a password. */
  target: string;
  ok: boolean;
  /** How long the reading took, in milliseconds. */
  ms: number;
  /** How many devices it reported. */
  devices: number;
  error?: string;
  /** Whether a token was found in the environment for it. */
  authed: boolean;
};

/** One whole answer to "what is the house doing", from GET /api/devices/state. */
export type HomeState = {
  controllers: ControllerHealth[];
  /** device id -> what its controller says about it. */
  states: Record<string, DeviceState>;
  /**
   * Addresses a controller reported that no device in the registry claims, so
   * Setup can offer to add them instead of making somebody go and look one up.
   */
  discovered: { controller: string; address: string; kindHint: string }[];
  /** When the readings were taken, ISO, from the server's clock. */
  at: string;
};

/* ---------------- commands ---------------- */

export type Command = {
  power?: boolean;
  setpoint?: number;
  mode?: string;
  fan?: string;
};

export const COMMAND_KEYS: readonly Control[] = ["power", "setpoint", "mode", "fan"];

/**
 * Check one instruction against the device it is for, and return what should
 * actually be sent. The only gate in front of the hardware: the page, the API
 * and the MCP tool all come through here, so a model asking for 90°C of hot
 * water and a stale browser tab asking a tank to switch itself on get the same
 * answer.
 *
 * A setpoint outside the range is clamped rather than refused, and the clamp is
 * reported so the caller can say what was actually sent. Asking for more heat
 * than a geyser allows is a mistake about the device and not about the
 * intention, and the safe reading of "as hot as it goes" is the top of its
 * range. Everything else — an unknown mode, a control the kind does not have,
 * a device marked monitor-only — is refused with the reason.
 */
export function planCommand(
  device: Device,
  requested: Command,
): { command: Command; clamped: boolean } | { error: string } {
  const asked = Object.entries(requested).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!asked.length) return { error: "Nothing to change — send power, setpoint, mode or fan." };

  if (device.readOnly) {
    return { error: `${device.name || device.id} is set to monitor only. Turn that off in Setup to control it.` };
  }

  for (const [key] of asked) {
    if (!(COMMAND_KEYS as readonly string[]).includes(key)) return { error: `${key} is not something to set.` };
    if (!can(device, key as Control)) {
      return { error: `A ${kindLabel(device.kind).toLowerCase()} has no ${key} to set.` };
    }
  }

  const command: Command = {};
  let clamped = false;

  if (requested.power !== undefined) {
    if (typeof requested.power !== "boolean") return { error: "power must be true or false." };
    command.power = requested.power;
  }

  if (requested.setpoint !== undefined) {
    const range = setpointRange(device);
    if (!range) return { error: `${device.name || device.id} has no setpoint.` };
    const wanted = Number(requested.setpoint);
    if (!Number.isFinite(wanted)) return { error: "setpoint must be a number." };
    const stepped = Math.round(wanted / range.step) * range.step;
    const inside = Math.min(range.max, Math.max(range.min, stepped));
    // Rounding to the step is not a clamp; only leaving the range is.
    clamped = inside !== stepped;
    command.setpoint = Math.round(inside * 100) / 100;
  }

  if (requested.mode !== undefined) {
    const modes = modesOf(device);
    const mode = text(requested.mode).toLowerCase();
    if (!modes.includes(mode)) return { error: `${device.name || device.id} takes one of: ${modes.join(", ")}.` };
    command.mode = mode;
  }

  if (requested.fan !== undefined) {
    const fans = fansOf(device);
    const fan = text(requested.fan).toLowerCase();
    if (!fans.includes(fan)) return { error: `${device.name || device.id} takes a fan speed of: ${fans.join(", ")}.` };
    command.fan = fan;
  }

  return { command, clamped };
}

/** "on · cool · 24°C · fan auto" — what a card says under the name. */
export function describeState(device: Device, state: DeviceState | undefined) {
  if (!state) return "No reading yet";
  if (!state.online) return "Offline";
  // A tank or a probe has nothing to say beyond its reading, which is shown
  // beside this line; "no detail reported" would read as something missing.
  if (controlsOf(device).length === 0) return "monitor only";
  const bits: string[] = [];
  if (state.power !== null) bits.push(state.power ? "on" : "off");
  if (state.mode) bits.push(state.mode);
  if (state.setpoint !== null && can(device, "setpoint")) bits.push(`${state.setpoint}${KINDS[device.kind].unit}`);
  if (state.fan) bits.push(`fan ${state.fan}`);
  return bits.join(" · ") || "No detail reported";
}

/* ---------------- validation ---------------- */

/**
 * A controller URL the API is willing to call. http and https only, and no
 * credentials in it: a stored `http://user:pass@host` is a password in the
 * database and in every log line that prints the target.
 *
 * This is checked where a controller is actually called (`server/edge.ts`) and
 * not by `normalizeDevices`, deliberately. The setup form saves on every
 * keystroke, and "http:" is an unavoidable intermediate state while somebody
 * types "http://192.168.1.50" — refusing it would revert the field and make
 * the address impossible to type at all. So an unusable address is stored and
 * reported as unreachable, which is what it is, and the gate sits in front of
 * the fetch where it has to be anyway.
 */
export function isControllerUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Nobody types a scheme. A bare 192.168.1.50:8080 becomes http://. */
export const cleanControllerUrl = (raw: string) => {
  const value = raw.trim().replace(/\/+$/, "");
  return !value || value.includes("://") ? value : `http://${value}`;
};

/** An .env key: upper snake case, so a token setting cannot name a path. */
export const isEnvKey = (value: string) => value === "" || /^[A-Z][A-Z0-9_]{0,59}$/.test(value);

export const blankController = (id: string, over: Partial<Controller> = {}): Controller => ({
  id,
  name: "",
  url: "",
  tokenEnv: "EDGE_TOKEN",
  notes: "",
  ...over,
});

export const blankDevice = (id: string, over: Partial<Device> = {}): Device => ({
  id,
  name: "",
  kind: "switch",
  room: "",
  controller: "",
  address: "",
  minSetpoint: null,
  maxSetpoint: null,
  modes: [],
  readOnly: false,
  ...over,
});

const limit = (value: number | null, lo: number, hi: number) =>
  value === null ? null : Math.min(hi, Math.max(lo, value));

/**
 * Validate and normalise the whole registry — the only gate in front of the
 * database, the way `normalizeCalendar` is for the calendar. A device must
 * point at a controller that exists in the same document: one whose controller
 * was deleted is unreachable in a way no page could explain.
 */
export function normalizeDevices(input: unknown): { doc: DevicesDoc } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected { controllers: [...], devices: [...] }." };
  const rawControllers = (input as { controllers?: unknown }).controllers;
  const rawDevices = (input as { devices?: unknown }).devices;
  if (!Array.isArray(rawControllers) || !Array.isArray(rawDevices)) {
    return { error: "Expected { controllers: [...], devices: [...] }." };
  }
  if (rawControllers.length > MAX_CONTROLLERS) return { error: `No more than ${MAX_CONTROLLERS} controllers.` };
  if (rawDevices.length > MAX_DEVICES) return { error: `No more than ${MAX_DEVICES} devices.` };

  const controllers: Controller[] = [];
  const seenControllers = new Set<string>();

  for (const [i, entry] of rawControllers.entries()) {
    const at = `Controller ${i + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not an object.` };
    const row = entry as Record<string, unknown>;

    const id = text(row.id);
    if (!id) return { error: `${at} has no id.` };
    if (id.length > 60) return { error: `${at}: id is too long.` };
    if (seenControllers.has(id)) return { error: `${at}: duplicate id "${id}".` };
    seenControllers.add(id);

    const name = text(row.name);
    if (name.length > 80) return { error: `${at}: name is too long (80 characters max).` };

    // Stored as typed, scheme filled in when it is missing. An address that is
    // blank or not yet a URL is simply unreachable, and the page and `edge.ts`
    // both say so — see `isControllerUrl` for why this is not a refusal.
    const url = cleanControllerUrl(text(row.url));
    if (url.length > 300) return { error: `${at}: the address is too long.` };

    const tokenEnv = text(row.tokenEnv).toUpperCase();
    if (!isEnvKey(tokenEnv)) return { error: `${at}: the token setting has to be a name like EDGE_TOKEN.` };

    const notes = text(row.notes);
    if (notes.length > 300) return { error: `${at}: notes are too long (300 characters max).` };

    controllers.push({ id, name, url, tokenEnv, notes });
  }

  const devices: Device[] = [];
  const seenDevices = new Set<string>();
  const seenAddresses = new Set<string>();

  for (const [i, entry] of rawDevices.entries()) {
    const at = `Device ${i + 1}`;
    if (!entry || typeof entry !== "object") return { error: `${at} is not an object.` };
    const row = entry as Record<string, unknown>;

    const id = text(row.id);
    if (!id) return { error: `${at} has no id.` };
    if (id.length > 60) return { error: `${at}: id is too long.` };
    if (seenDevices.has(id)) return { error: `${at}: duplicate id "${id}".` };
    seenDevices.add(id);

    // A name may be blank: the setup form saves as you type, and refusing an
    // empty one would stop you clearing the field to retype it — the same rule,
    // for the same reason, as item names in normalizeInventory.
    const name = text(row.name);
    if (name.length > 80) return { error: `${at}: name is too long (80 characters max).` };

    const kind = text(row.kind) || "switch";
    if (!isDeviceKind(kind)) return { error: `${at}: unknown kind "${kind}".` };

    const room = text(row.room);
    if (room.length > 60) return { error: `${at}: room is too long (60 characters max).` };

    const controller = text(row.controller);
    if (controller && !seenControllers.has(controller)) {
      return { error: `${at}: there is no controller "${controller}".` };
    }

    const address = text(row.address);
    if (address.length > 120) return { error: `${at}: address is too long (120 characters max).` };
    // Two devices on one controller address would both answer to one command.
    if (controller && address) {
      const pair = `${controller}\u0000${address}`;
      if (seenAddresses.has(pair)) return { error: `${at}: "${address}" is already used on that controller.` };
      seenAddresses.add(pair);
    }

    const spec = KINDS[kind].setpoint;
    const min = numberOr(row.minSetpoint);
    const max = numberOr(row.maxSetpoint);
    if ((min !== null || max !== null) && !spec) {
      return { error: `${at}: a ${KINDS[kind].label.toLowerCase()} has no setpoint.` };
    }
    if (min !== null && max !== null && min > max) {
      return { error: `${at}: the lowest setpoint has to be below the highest.` };
    }

    const modes = Array.isArray(row.modes)
      ? row.modes.map((m) => text(m).toLowerCase()).filter((m) => KINDS[kind].modes.includes(m))
      : [];

    devices.push({
      id,
      name,
      kind,
      room,
      controller,
      address,
      minSetpoint: spec ? limit(min, spec.min, spec.max) : null,
      maxSetpoint: spec ? limit(max, spec.min, spec.max) : null,
      modes: [...new Set(modes)],
      readOnly: row.readOnly === true,
    });
  }

  // Stored order is the order rows were added, as it is for categories,
  // subscriptions and the family: the setup form saves on every keystroke, and
  // a list that re-sorted itself would move the row out from under the cursor.
  // The control page groups by room on the way out instead — see `byRoom`.
  return { doc: { controllers, devices } };
}

export const NO_ROOM = "No room";

/**
 * Devices grouped the way the page draws them: a section per room, rooms in
 * alphabetical order with the unroomed ones last, and each room's devices by
 * name. Sorting happens here and not in the stored document, so editing a name
 * in Setup never moves the row being typed into.
 */
export function byRoom(devices: Device[]): { room: string; devices: Device[] }[] {
  const rooms = new Map<string, Device[]>();
  for (const device of devices) {
    const key = device.room || NO_ROOM;
    rooms.set(key, [...(rooms.get(key) ?? []), device]);
  }
  return [...rooms]
    .map(([room, list]) => ({
      room,
      devices: [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => {
      if (a.room === NO_ROOM) return 1;
      if (b.room === NO_ROOM) return -1;
      return a.room.localeCompare(b.room);
    });
}
