"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowsClockwise, CheckCircle, Plus, Trash, WarningCircle } from "@phosphor-icons/react";
import { newId } from "@/lib/inventory";
import {
  DEVICE_KINDS,
  KINDS,
  blankController,
  blankDevice,
  byRoom,
  isControllerUrl,
  kindLabel,
  normalizeDevices,
  setpointRange,
  stateSummary,
  type Controller,
  type Device,
  type DevicesDoc,
} from "@/lib/devices";
import { useDevices, useHomeState } from "../use-devices";
import { Card, Notice, Skeleton, Tabs } from "../ui";
import { PageGrid, PageHeader, Span } from "../page-frame";
import { DeviceCard } from "./device-card";

/**
 * The smart home: two tabs, because watching the house and wiring it up are
 * different jobs done at different times.
 *
 * **Control** is live and owns nothing: it polls `/api/devices/state`, which
 * reads through the edge controllers, and every button posts one command back.
 * Nothing on this tab is stored — a temperature is true for a few seconds.
 *
 * **Setup** is the registry: which controllers exist, what they own, and what
 * each device is allowed to be asked. It is ordinary configuration and saves as
 * you type, like the family list.
 */

type Tab = "control" | "setup";

const TABS = [
  { id: "control" as const, title: "Control" },
  { id: "setup" as const, title: "Setup" },
];

export default function DevicesPage() {
  const { doc, error, save } = useDevices();
  const { home, error: stateError, refresh, send } = useHomeState();
  const [tab, setTab] = useState<Tab>("control");
  const [localError, setLocalError] = useState<string | null>(null);

  const devices = doc?.devices ?? [];
  const controllers = doc?.controllers ?? [];
  const rooms = useMemo(() => byRoom(devices), [devices]);
  const summary = useMemo(() => stateSummary(devices, home?.states ?? {}), [devices, home]);
  const down = (home?.controllers ?? []).filter((c) => !c.ok);

  /** Every write goes through the same validator the API uses. */
  const commit = (next: DevicesDoc) => {
    const check = normalizeDevices(next);
    if ("error" in check) {
      setLocalError(check.error);
      return;
    }
    setLocalError(null);
    save(check.doc);
  };

  const patchDevice = (id: string, next: Device | null) =>
    commit({
      controllers,
      devices: next ? devices.map((d) => (d.id === id ? next : d)) : devices.filter((d) => d.id !== id),
    });

  const patchController = (id: string, next: Controller | null) => {
    if (next) return commit({ controllers: controllers.map((c) => (c.id === id ? next : c)), devices });
    // A controller cannot be deleted out from under its devices: the validator
    // refuses a device pointing at one that is gone, and silently unpairing a
    // houseful of devices would be a worse surprise than refusing.
    const orphans = devices.filter((d) => d.controller === id);
    if (orphans.length) {
      setLocalError(
        `${orphans.length} ${orphans.length === 1 ? "device is" : "devices are"} on that controller. ` +
          "Move or remove them first.",
      );
      return;
    }
    commit({ controllers: controllers.filter((c) => c.id !== id), devices });
  };

  const addDevice = (over: Partial<Device> = {}) =>
    commit({
      controllers,
      devices: [...devices, blankDevice(newId(), { controller: controllers[0]?.id ?? "", ...over })],
    });

  const ready = !!doc;

  return (
    <PageGrid>
      <PageHeader
        title="Smart home"
        hint="Air conditioning, hot water and pumps, through an edge controller on your own network."
      />

      <Span>
        <Tabs tabs={TABS} current={tab} onChange={setTab} label="Smart home sections" />
      </Span>

      {(error || localError) && (
        <Span>
          <Notice>{localError ?? error}</Notice>
        </Span>
      )}
      {!ready && !error && (
        <Span>
          <Skeleton rows={3} label="Loading the devices" />
        </Span>
      )}

      {ready && tab === "control" && (
        <>
          <Span>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
              {[
                ["devices", summary.total],
                ["switched on", summary.on],
                ["not answering", summary.offline],
                ["controllers", `${controllers.length - down.length}/${controllers.length}`],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-surface px-3 py-3">
                  <dd className="font-mono text-xl tabular-nums">{value}</dd>
                  <dt className="mt-1 text-xs text-muted">{label}</dt>
                </div>
              ))}
            </dl>
          </Span>

          {stateError && (
            <Span>
              <Notice>
                The readings have stopped arriving: {stateError} The last ones are still shown, and they are only as
                fresh as the time above.
              </Notice>
            </Span>
          )}

          {down.map((controller) => (
            <Span key={controller.id}>
              <Notice>
                {controller.name} ({controller.target}) did not answer: {controller.error} Everything it owns is shown
                as offline.
              </Notice>
            </Span>
          ))}

          {devices.length === 0 ? (
            <Span>
              <Card
                dense
                title="Nothing is paired yet"
                subtitle="A device belongs to an edge controller, and the controller does the talking."
              >
                <ol className="grid list-decimal gap-2 pl-5 text-sm">
                  <li>
                    Run a controller on your network. There is one in this repo to try it with:{" "}
                    <code className="rounded bg-bg px-1 font-mono text-xs">pnpm edge</code> starts a simulator on port
                    8099 with an air conditioner, a geyser, a pump and a tank.
                  </li>
                  <li>
                    Open <button type="button" onClick={() => setTab("setup")} className="text-accent hover:underline">Setup</button>,
                    add a controller pointing at it (<code className="rounded bg-bg px-1 font-mono text-xs">http://127.0.0.1:8099</code>),
                    and press Test.
                  </li>
                  <li>Add its devices — anything the controller reports is offered by address, so there is nothing to look up.</li>
                </ol>
                <p className="mt-3 text-xs text-muted">
                  The protocol a real controller has to speak is three routes, documented in{" "}
                  <code className="rounded bg-bg px-1 font-mono text-xs">server/edge.ts</code>.
                </p>
              </Card>
            </Span>
          ) : (
            rooms.map(({ room, devices: inRoom }) => (
              <Card
                key={room}
                dense
                title={room}
                subtitle={`${inRoom.length} ${inRoom.length === 1 ? "device" : "devices"}`}
                aside={
                  <button
                    type="button"
                    onClick={refresh}
                    aria-label={`Refresh ${room}`}
                    className="grid size-8 place-items-center rounded-xl border border-border text-muted hover:text-fg"
                  >
                    <ArrowsClockwise size={13} />
                  </button>
                }
              >
                <ul className="grid gap-2">
                  {inRoom.map((device) => {
                    const health = home?.controllers.find((c) => c.id === device.controller);
                    return (
                      <DeviceCard
                        key={device.id}
                        device={device}
                        state={home?.states[device.id]}
                        controllerDown={
                          !device.controller
                            ? "No controller — pick one in Setup."
                            : health && !health.ok
                              ? `${health.name} is not answering.`
                              : undefined
                        }
                        onSend={(command) => send(device.id, command)}
                      />
                    );
                  })}
                </ul>
              </Card>
            ))
          )}

          {home && (
            <Span>
              <p className="text-xs text-muted">
                Read {new Date(home.at).toLocaleTimeString()} · polling every 5 seconds, and paused while this tab is
                in the background.
                {summary.stale > 0 && ` ${summary.stale} reading${summary.stale === 1 ? "" : "s"} older than two minutes.`}
              </p>
            </Span>
          )}
        </>
      )}

      {ready && tab === "setup" && (
        <>
          <Span>
            <Card
              dense
              title="Edge controllers"
              subtitle="One box per row. The app only ever talks to these, never to a device."
              aside={
                <button
                  type="button"
                  onClick={() => commit({ controllers: [...controllers, blankController(newId())], devices })}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-surface"
                >
                  <Plus size={13} weight="bold" />
                  Add controller
                </button>
              }
            >
              <div className="grid gap-2">
                {controllers.length === 0 && (
                  <p className="rounded-xl border border-border px-3 py-6 text-center text-xs text-muted">
                    No controller yet. Press Add controller and point it at the box on your network.
                  </p>
                )}
                {controllers.map((controller) => (
                  <ControllerRow
                    key={controller.id}
                    controller={controller}
                    devices={devices.filter((d) => d.controller === controller.id).length}
                    onChange={(next) => patchController(controller.id, next)}
                    onDelete={() => patchController(controller.id, null)}
                  />
                ))}
              </div>
            </Card>
          </Span>

          {(home?.discovered.length ?? 0) > 0 && (
            <Span>
              <Card
                dense
                title="Reported but not added"
                subtitle="Addresses a controller mentioned that nothing in the registry claims."
              >
                <ul className="grid gap-2">
                  {home!.discovered.map((found) => (
                    <li
                      key={`${found.controller}-${found.address}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{found.address}</span>
                        <span className="text-[11px] text-muted">
                          on {controllers.find((c) => c.id === found.controller)?.name || found.controller}
                          {found.kindHint && ` · says it is a ${found.kindHint}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          addDevice({
                            controller: found.controller,
                            address: found.address,
                            kind: DEVICE_KINDS.includes(found.kindHint as Device["kind"])
                              ? (found.kindHint as Device["kind"])
                              : "switch",
                            name: found.address,
                          })
                        }
                        className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:text-accent"
                      >
                        <Plus size={12} weight="bold" />
                        Add it
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </Span>
          )}

          <Span>
            <Card
              dense
              title="Devices"
              subtitle="What each one is, where it lives, and how far it may be pushed."
              aside={
                <button
                  type="button"
                  onClick={() => addDevice()}
                  disabled={controllers.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-40"
                >
                  <Plus size={13} weight="bold" />
                  Add device
                </button>
              }
            >
              <div className="grid gap-2">
                {devices.length === 0 && (
                  <p className="rounded-xl border border-border px-3 py-6 text-center text-xs text-muted">
                    {controllers.length
                      ? "No devices yet. Add one, or add a reported address above."
                      : "Add a controller first — a device needs one to talk through."}
                  </p>
                )}
                {devices.map((device) => (
                  <DeviceRow
                    key={device.id}
                    device={device}
                    controllers={controllers}
                    onChange={(next) => patchDevice(device.id, next)}
                    onDelete={() => patchDevice(device.id, null)}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                A token is never stored here. The controller row names an <code className="font-mono">.env</code> key
                and the server reads it when it calls out, so the secret stays beside the database password — set it on{" "}
                <Link href="/settings" className="text-accent hover:underline">
                  Settings
                </Link>{" "}
                or in the file.
              </p>
            </Card>
          </Span>
        </>
      )}
    </PageGrid>
  );
}

const field = "rounded-lg border border-border bg-bg px-2 py-1.5 text-sm placeholder:text-muted";

function ControllerRow({
  controller,
  devices,
  onChange,
  onDelete,
}: {
  controller: Controller;
  devices: number;
  onChange: (next: Controller) => void;
  onDelete: () => void;
}) {
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  /**
   * Ask the server to call the controller's /health. The browser never calls a
   * controller itself: the token lives on the server, and a LAN address is not
   * reachable from wherever the page happens to be open.
   */
  const check = async () => {
    setTesting(true);
    setTest(null);
    try {
      const response = await fetch(`/api/devices/check?controller=${encodeURIComponent(controller.id)}`);
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        name?: string;
        version?: string;
        ms?: number;
        authed?: boolean;
        tokenEnv?: string;
      } | null;
      if (!response.ok || !body?.ok) {
        setTest({ ok: false, text: body?.error || response.statusText || "No answer." });
      } else {
        const token = body.authed ? "token sent" : body.tokenEnv ? `${body.tokenEnv} is not set` : "no token";
        setTest({
          ok: true,
          text: `Answered in ${body.ms}ms${body.name ? ` — ${body.name}` : ""}${body.version ? ` ${body.version}` : ""} · ${token}`,
        });
      }
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    }
    setTesting(false);
  };

  return (
    <div className="grid gap-2 rounded-xl border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={controller.name}
          onChange={(e) => onChange({ ...controller, name: e.target.value })}
          placeholder="Kitchen Pi"
          aria-label="Controller name"
          className={`min-w-32 flex-1 ${field}`}
        />
        <input
          value={controller.url}
          onChange={(e) => onChange({ ...controller, url: e.target.value })}
          placeholder="http://192.168.1.50:8080"
          aria-label="Controller address"
          inputMode="url"
          className={`min-w-48 flex-[2] font-mono text-xs ${field}`}
        />
        <input
          value={controller.tokenEnv}
          onChange={(e) => onChange({ ...controller, tokenEnv: e.target.value.toUpperCase() })}
          placeholder="EDGE_TOKEN"
          aria-label="Which .env key holds its token"
          className={`w-36 font-mono text-xs ${field}`}
        />
        <button
          type="button"
          onClick={check}
          disabled={testing || !controller.url}
          className="rounded-xl border border-border px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {testing ? "Testing…" : "Test"}
        </button>
        <button
          type="button"
          aria-label={`Remove ${controller.name || "this controller"}`}
          onClick={onDelete}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:text-warn"
        >
          <Trash size={15} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          {devices} {devices === 1 ? "device" : "devices"}
        </span>
        {controller.url && !isControllerUrl(controller.url) && (
          <span className="text-warn">Not a usable address yet — it has to be http:// or https://.</span>
        )}
        {test && (
          <span className={`inline-flex items-center gap-1 ${test.ok ? "text-accent" : "text-warn"}`}>
            {test.ok ? <CheckCircle size={12} /> : <WarningCircle size={12} />}
            {test.text}
          </span>
        )}
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  controllers,
  onChange,
  onDelete,
}: {
  device: Device;
  controllers: Controller[];
  onChange: (next: Device) => void;
  onDelete: () => void;
}) {
  const spec = KINDS[device.kind];
  const range = setpointRange(device);

  return (
    <div className="grid gap-2 rounded-xl border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={device.name}
          onChange={(e) => onChange({ ...device, name: e.target.value })}
          placeholder="Bedroom AC"
          aria-label="Device name"
          className={`min-w-32 flex-1 ${field}`}
        />
        <select
          value={device.kind}
          onChange={(e) => onChange({ ...device, kind: e.target.value as Device["kind"], modes: [] })}
          aria-label={`What ${device.name || "this device"} is`}
          className={`w-40 ${field}`}
        >
          {DEVICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabel(kind)}
            </option>
          ))}
        </select>
        <input
          value={device.room}
          onChange={(e) => onChange({ ...device, room: e.target.value })}
          placeholder="Room"
          aria-label="Room"
          className={`w-32 ${field}`}
        />
        <select
          value={device.controller}
          onChange={(e) => onChange({ ...device, controller: e.target.value })}
          aria-label="Which controller it is on"
          className={`w-40 ${field}`}
        >
          <option value="">No controller</option>
          {controllers.map((controller) => (
            <option key={controller.id} value={controller.id}>
              {controller.name || controller.id}
            </option>
          ))}
        </select>
        <input
          value={device.address}
          onChange={(e) => onChange({ ...device, address: e.target.value })}
          placeholder="address on the controller"
          aria-label="Address on the controller"
          className={`min-w-40 flex-1 font-mono text-xs ${field}`}
        />
        <button
          type="button"
          aria-label={`Remove ${device.name || "this device"}`}
          onClick={onDelete}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:text-warn"
        >
          <Trash size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted">
        <span className="max-w-full">{spec.hint}</span>

        {range && (
          <label className="inline-flex items-center gap-1">
            Allowed
            <input
              type="number"
              value={device.minSetpoint ?? ""}
              onChange={(e) =>
                onChange({ ...device, minSetpoint: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder={String(KINDS[device.kind].setpoint!.min)}
              aria-label="Lowest setpoint this unit takes"
              className="w-16 rounded-lg border border-border bg-bg px-1.5 py-1 text-center font-mono tabular-nums"
            />
            to
            <input
              type="number"
              value={device.maxSetpoint ?? ""}
              onChange={(e) =>
                onChange({ ...device, maxSetpoint: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder={String(KINDS[device.kind].setpoint!.max)}
              aria-label="Highest setpoint this unit takes"
              className="w-16 rounded-lg border border-border bg-bg px-1.5 py-1 text-center font-mono tabular-nums"
            />
            {spec.unit}
          </label>
        )}

        {spec.modes.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1">
            Modes
            {spec.modes.map((mode) => {
              const picked = device.modes.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={picked}
                  onClick={() =>
                    onChange({
                      ...device,
                      modes: picked ? device.modes.filter((m) => m !== mode) : [...device.modes, mode],
                    })
                  }
                  className={`rounded-lg px-1.5 py-0.5 capitalize ${
                    picked ? "bg-accent-soft text-accent" : "border border-border"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
            {device.modes.length === 0 && <span>· all of them</span>}
          </span>
        )}

        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={device.readOnly}
            onChange={(e) => onChange({ ...device, readOnly: e.target.checked })}
          />
          Monitor only
        </label>
      </div>
    </div>
  );
}
