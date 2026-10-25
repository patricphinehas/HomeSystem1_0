"use client";

import { useEffect, useRef, useState } from "react";
import { Drop, Fan, Lightning, Power, Thermometer, WifiSlash } from "@phosphor-icons/react";
import {
  KINDS,
  can,
  fansOf,
  isStale,
  modesOf,
  setpointRange,
  type Command,
  type Device,
  type DeviceState,
} from "@/lib/devices";

/**
 * One device: what it reads, and the two or three things it will take an
 * instruction about.
 *
 * The card draws its controls from the device's kind (lib/devices.ts), never
 * from what the controller happened to report, so an unreachable device still
 * shows what it is — greyed out — instead of collapsing to a name. Pressing a
 * control sends it and waits: the controller's own answer is what lands back
 * on the card, so the switch shows what the device says it is doing and not
 * what was asked of it. A controller that cannot confirm (an air conditioner
 * behind an IR blaster) leaves the switch as it was, which is honest.
 */

const ICONS = {
  ac: Fan,
  thermostat: Thermometer,
  "water-heater": Drop,
  "water-pump": Drop,
  "water-tank": Drop,
  switch: Power,
  sensor: Thermometer,
} as const;

/** The reading, big, in its own unit. "—" when nothing has been reported. */
function Reading({ device, state }: { device: Device; state: DeviceState | undefined }) {
  const spec = KINDS[device.kind];
  if (spec.reading === "none") return null;
  const value = state?.online ? state.value : null;
  return (
    <p className="font-mono text-2xl leading-none tabular-nums">
      {value === null || value === undefined ? <span className="text-muted">—</span> : value}
      <span className="ml-0.5 text-sm text-muted">{spec.unit}</span>
    </p>
  );
}

/** A level as a bar, because 62% of a water tank is a picture, not a number. */
function Level({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg" role="img" aria-label={`${pct}% full`}>
      <div
        className={`h-full rounded-full ${pct <= 20 ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const chip = "rounded-lg px-2 py-1 text-xs capitalize transition disabled:opacity-40";

export function DeviceCard({
  device,
  state,
  controllerDown,
  onSend,
}: {
  device: Device;
  state: DeviceState | undefined;
  /** Set when the device's controller did not answer at all. */
  controllerDown?: string;
  onSend: (command: Command) => Promise<{ ok: true; clamped?: boolean } | { ok: false; error: string }>;
}) {
  const [busy, setBusy] = useState<keyof Command | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * The setpoint being composed. A run of presses moves this number under the
   * finger and sends one command when they stop: four taps on + is one
   * instruction to the hardware, not four, and not one every round-trip.
   */
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The same number as `draft`, in a ref. Two presses in one task — a double
   * tap, or a held key — both read the state from the render they were drawn
   * in, so composing from the state variable would count only the last of
   * them. The ref is the running total.
   */
  const composed = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const spec = KINDS[device.kind];
  const Icon = ICONS[device.kind];
  const range = setpointRange(device);
  const offline = !state?.online || !!controllerDown;
  const stale = !!state && state.online && isStale(state);
  const on = state?.power === true;

  const send = async (command: Command, which: keyof Command) => {
    setBusy(which);
    setError(null);
    setNote(null);
    const result = await onSend(command);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    // A clamp is not a failure, but the card has to say the device took
    // something other than what was pressed.
    if (result.clamped && command.setpoint !== undefined) setNote("That is as far as this one goes.");
  };

  const sendSetpoint = async (value: number) => {
    setError(null);
    setNote(null);
    const result = await onSend({ setpoint: value });
    // Only drop the draft if nothing has been pressed since, or the number
    // would jump back to the controller's older reading mid-adjustment.
    if (composed.current === value) composed.current = null;
    setDraft((current) => (current === value ? null : current));
    if (!result.ok) return setError(result.error);
    if (result.clamped) setNote("That is as far as this one goes.");
  };

  const step = (by: number) => {
    if (!range) return;
    const from = composed.current ?? state?.setpoint ?? Math.round((range.min + range.max) / 2);
    const next = Math.round(Math.min(range.max, Math.max(range.min, from + by * range.step)) * 100) / 100;
    composed.current = next;
    setDraft(next);
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => void sendSetpoint(next), 450);
  };

  /** What the stepper reads: what is being composed, or what the device says. */
  const target = draft ?? state?.setpoint ?? range?.min ?? null;

  return (
    <li className="grid content-start gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon size={16} className={on ? "text-accent" : "text-muted"} />
          <div className="min-w-0">
            <p className="truncate text-sm">{device.name || "Unnamed device"}</p>
            <p className="truncate text-[11px] text-muted">
              {spec.label}
              {device.readOnly && " · monitor only"}
            </p>
          </div>
        </div>
        <span className={`shrink-0 text-[11px] ${offline ? "text-warn" : on ? "text-accent" : "text-muted"}`}>
          {offline ? (
            <span className="inline-flex items-center gap-1">
              <WifiSlash size={12} />
              offline
            </span>
          ) : state?.power === null ? (
            "no switch state"
          ) : on ? (
            "on"
          ) : (
            "off"
          )}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <Reading device={device} state={state} />
        <div className="grid justify-items-end gap-0.5 text-[11px] text-muted">
          {state?.watts !== null && state?.watts !== undefined && !offline && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Lightning size={11} />
              {state.watts} W
            </span>
          )}
          {range && (
            <span className="font-mono tabular-nums">
              target {state?.setpoint ?? "—"}
              {spec.unit}
            </span>
          )}
        </div>
      </div>

      {spec.reading === "level" && state?.value !== null && state?.value !== undefined && !offline && (
        <Level value={state.value} />
      )}

      {can(device, "power") && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offline || busy !== null}
            aria-pressed={on}
            onClick={() => send({ power: !on }, "power")}
            className={`flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition disabled:opacity-40 ${
              on ? "bg-accent text-surface" : "border border-border text-fg"
            }`}
          >
            <Power size={13} weight="bold" />
            {busy === "power" ? "Sending…" : on ? "Turn off" : "Turn on"}
          </button>
          {range && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label={`Lower the target for ${device.name}`}
                disabled={offline || busy !== null || (target ?? range.min) <= range.min}
                onClick={() => step(-1)}
                className="grid size-9 place-items-center rounded-xl border border-border text-sm transition active:scale-[0.96] disabled:opacity-40"
              >
                −
              </button>
              <span
                className={`w-14 text-center font-mono text-sm tabular-nums ${draft !== null ? "text-accent" : ""}`}
              >
                {target ?? range.min}
                {spec.unit}
              </span>
              <button
                type="button"
                aria-label={`Raise the target for ${device.name}`}
                disabled={offline || busy !== null || (target ?? range.max) >= range.max}
                onClick={() => step(1)}
                className="grid size-9 place-items-center rounded-xl border border-border text-sm transition active:scale-[0.96] disabled:opacity-40"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      {can(device, "mode") && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] text-muted">Mode</span>
          {modesOf(device).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={offline || busy !== null}
              aria-pressed={state?.mode === mode}
              onClick={() => send({ mode }, "mode")}
              className={`${chip} ${
                state?.mode === mode ? "bg-accent-soft font-medium text-accent" : "border border-border text-muted"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      {can(device, "fan") && fansOf(device).length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] text-muted">Fan</span>
          {fansOf(device).map((fan) => (
            <button
              key={fan}
              type="button"
              disabled={offline || busy !== null}
              aria-pressed={state?.fan === fan}
              onClick={() => send({ fan }, "fan")}
              className={`${chip} ${
                state?.fan === fan ? "bg-accent-soft font-medium text-accent" : "border border-border text-muted"
              }`}
            >
              {fan}
            </button>
          ))}
        </div>
      )}

      {controllerDown && <p className="text-[11px] text-warn">{controllerDown}</p>}
      {stale && !controllerDown && (
        <p className="text-[11px] text-warn">The controller has not heard from this one in a while.</p>
      )}
      {error && <p className="text-[11px] text-warn">{error}</p>}
      {note && !error && <p className="text-[11px] text-muted">{note}</p>}
    </li>
  );
}
