"use client";

import { useEffect, useState } from "react";
import { region, setRegion } from "@/lib/region";

/**
 * Applies the household's locale, timezone and currency to `lib/region.ts`
 * once, in the browser, from the same settings the server reads. Mounted in
 * MainFrame, which wraps every page, so `inr()` and `todayISO()` are right
 * everywhere without 46 call sites learning about settings.
 *
 * The formatters are module-level, so a page that has already painted its
 * numbers will not repaint them by itself. The counter this returns is used as
 * a key by MainFrame to force exactly one repaint — and it only moves when the
 * fetched settings actually differ from what was already in effect. A
 * household on the defaults never remounts; one that has changed its region
 * remounts once, while the pages are still showing skeletons.
 *
 * ponytail: if a region ever has to change without a page load, this becomes a
 * context and the formatters become hooks. That is 46 call sites, so not yet.
 */
export function useRegion() {
  const [applied, setApplied] = useState(0);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { fields?: { key: string; value: string }[] }) => {
        const value = (key: string) => data.fields?.find((f) => f.key === key)?.value ?? "";
        const before = region();
        const after = setRegion({
          locale: value("LOCALE"),
          timezone: value("TIMEZONE"),
          currency: value("CURRENCY"),
        });
        const changed =
          before.locale !== after.locale || before.timezone !== after.timezone || before.currency !== after.currency;
        if (changed) setApplied((n) => n + 1);
      })
      .catch(() => {
        // Unreachable settings leave the defaults in place, which still format.
      });
  }, []);

  return applied;
}
