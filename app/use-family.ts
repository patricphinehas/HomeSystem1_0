"use client";

import { useEffect, useState } from "react";
import type { FamilyDoc } from "@/lib/family";

/**
 * Who lives here, read once and written whole — the same optimistic pattern as
 * useSubscriptions and useCalendar. The screen updates first and the PUT
 * follows, because a household list is not contended enough to wait on.
 */
export function useFamily() {
  const [doc, setDoc] = useState<FamilyDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/family")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setDoc)
      .catch(() => setError("Could not load the household."));
  }, []);

  const save = (next: FamilyDoc) => {
    setDoc(next);
    setError(null);
    fetch("/api/family", {
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
