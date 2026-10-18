"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Read-only JSON fetch with a reload trigger. A reload keeps the previous data
 * on screen (no skeleton flash, no layout jump) until the new payload lands.
 * A null url fetches nothing, for data that is only needed once something opens.
 */
export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || r.statusText);
        if (live) {
          setData(body as T);
          setError(null);
        }
      })
      .catch((e: Error) => live && setError(e.message || "Could not load."));
    return () => {
      live = false;
    };
  }, [url, tick]);

  return { data, error, loading: !!url && !data && !error, reload: useCallback(() => setTick((t) => t + 1), []) };
}
