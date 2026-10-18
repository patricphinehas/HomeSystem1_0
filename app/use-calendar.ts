"use client";

import { useEffect, useState } from "react";
import type { CalendarDoc } from "@/lib/calendar";

/**
 * The shared calendar, read once and written whole — the same optimistic
 * pattern as useSubscriptions. The screen updates first and the PUT follows,
 * because a household calendar is not contended enough to wait on.
 */
export function useCalendar() {
  const [doc, setDoc] = useState<CalendarDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setDoc)
      .catch(() => setError("Could not load the calendar."));
  }, []);

  const save = (next: CalendarDoc) => {
    setDoc(next);
    setError(null);
    fetch("/api/calendar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
      })
      .catch(() => setError("Not saved. Your last change is only in this tab."));
  };

  return { doc, error, save };
}
