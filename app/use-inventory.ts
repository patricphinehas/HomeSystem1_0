"use client";

import { useEffect, useState } from "react";
import type { Inventory } from "@/lib/inventory";

export function useInventory() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inventory")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setInv)
      .catch(() => setError("Could not load the inventory file."));
  }, []);

  // Optimistic: render immediately, warn if the disk write fails.
  const save = (next: Inventory) => {
    setInv(next);
    setError(null);
    fetch("/api/inventory", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
      })
      .catch(() => setError("Not saved. Your last change is only in this tab."));
  };

  return { inv, error, save };
}
