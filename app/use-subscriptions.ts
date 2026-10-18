"use client";

import { useEffect, useState } from "react";
import type { SubscriptionsDoc } from "@/lib/subscriptions";

export function useSubscriptions() {
  const [doc, setDoc] = useState<SubscriptionsDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subscriptions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setDoc)
      .catch(() => setError("Could not load subscriptions."));
  }, []);

  const save = (next: SubscriptionsDoc) => {
    setDoc(next);
    setError(null);
    fetch("/api/subscriptions", {
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
