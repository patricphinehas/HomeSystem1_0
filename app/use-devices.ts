"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, DeviceState, DevicesDoc, HomeState } from "@/lib/devices";

/**
 * The smart-home registry, read once and written whole — the same optimistic
 * pattern as useCalendar. The registry is configuration (what exists, where it
 * is, what it is allowed to do), so it is edited by hand and saved as you type.
 */
export function useDevices() {
  const [doc, setDoc] = useState<DevicesDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devices")
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || r.statusText);
        return body as DevicesDoc;
      })
      .then(setDoc)
      .catch((e: Error) => setError(e.message || "Could not load the devices."));
  }, []);

  const save = (next: DevicesDoc) => {
    setDoc(next);
    setError(null);
    fetch("/api/devices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || r.statusText);
      })
      .catch((e: Error) => setError(`Not saved: ${e.message}`));
  };

  return { doc, error, save };
}

/**
 * What the house is doing, polled.
 *
 * The readings are live state and not data the app owns, so they are never
 * cached across a page load and never written anywhere — a temperature is only
 * true for a few seconds. Polling stops while the tab is hidden, because a
 * backgrounded dashboard asking a Raspberry Pi for readings every five seconds
 * all night is rude to the Pi and pointless.
 *
 * ponytail: `send` merges the controller's own answer for the one device it
 * touched rather than re-reading everything. A command that changes a second
 * device — a pump that a tank's float switch cuts out — shows up on the next
 * poll instead of immediately, which is the honest order anyway: the app finds
 * out when the controller says so.
 */
export function useHomeState(everyMs = 5000) {
  const [home, setHome] = useState<HomeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const read = useCallback(async () => {
    try {
      const response = await fetch("/api/devices/state");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || response.statusText);
      if (live.current) {
        setHome(body as HomeState);
        setError(null);
      }
    } catch (e) {
      // Keep the last readings on screen and say they have stopped arriving;
      // blanking the page on one failed poll loses what was there.
      if (live.current) setError((e as Error).message || "Could not read the devices.");
    }
  }, []);

  useEffect(() => {
    live.current = true;
    read();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      timer ??= setInterval(read, everyMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) return stop();
      read();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [read, everyMs]);

  /** Send one command. The answer replaces that device's reading right away. */
  const send = useCallback(async (deviceId: string, command: Command) => {
    try {
      const response = await fetch("/api/devices/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, ...command }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; clamped?: boolean; sent?: Command; state?: DeviceState | null }
        | null;
      if (!response.ok) return { ok: false as const, error: body?.error || response.statusText };

      const state = body?.state;
      if (state) {
        setHome((current) =>
          current ? { ...current, states: { ...current.states, [deviceId]: state } } : current,
        );
      }
      return { ok: true as const, clamped: !!body?.clamped, sent: body?.sent ?? command };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || "The command did not get through." };
    }
  }, []);

  return { home, error, refresh: read, send };
}
