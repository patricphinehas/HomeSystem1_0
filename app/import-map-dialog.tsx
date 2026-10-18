"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { BillInput } from "@/lib/bill";
import {
  addItemAlias,
  allInventoryItems,
  applyImportMapping,
  applyInventoryMatch,
  unmatchedImportLines,
} from "@/lib/match-inventory";
import type { Inventory } from "@/lib/inventory";

type RowChoice = { itemId: string | null; category: string | null; saveAlias: boolean };

export function ImportMapDialog({
  bills,
  inv,
  onCancel,
  onConfirm,
}: {
  bills: BillInput[];
  inv: Inventory;
  onCancel: () => void;
  onConfirm: (mapped: BillInput[], nextInv: Inventory | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const groups = useMemo(() => unmatchedImportLines(bills, inv), [bills, inv]);
  const items = useMemo(() => allInventoryItems(inv), [inv]);

  const [choices, setChoices] = useState<Map<string, RowChoice>>(() => {
    const m = new Map<string, RowChoice>();
    for (const key of groups.keys()) {
      m.set(key, { itemId: null, category: null, saveAlias: true });
    }
    return m;
  });

  useEffect(() => ref.current?.showModal(), []);

  const setChoice = (key: string, patch: Partial<RowChoice>) => {
    setChoices((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { itemId: null, category: null, saveAlias: true };
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  const onPick = (key: string, itemId: string) => {
    const hit = items.find((e) => e.item.id === itemId);
    setChoice(key, { itemId, category: hit?.category ?? null });
  };

  const submit = () => {
    let nextInv: Inventory | null = null;
    for (const [key, choice] of choices) {
      if (!choice.itemId || !choice.saveAlias) continue;
      const sample = groups.get(key)?.[0]?.name;
      if (!sample) continue;
      nextInv = addItemAlias(nextInv ?? inv, choice.itemId, sample);
    }

    const pick = new Map<string, { itemId: string | null; category: string | null }>();
    for (const [key, choice] of choices) {
      pick.set(key, { itemId: choice.itemId, category: choice.category });
    }
    const mapped = applyImportMapping(bills, inv, pick);
    onConfirm(mapped, nextInv);
  };

  const autoMatched = useMemo(() => {
    const auto = applyInventoryMatch(bills, inv);
    let n = 0;
    auto.forEach((b) => b.items.forEach((l) => l.itemId && n++));
    return n;
  }, [bills, inv]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-label="Map imported items to inventory"
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-fg backdrop:bg-black/40"
    >
      <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Link to inventory</h2>
          <p className="mt-0.5 text-xs text-muted">
            {autoMatched} line{autoMatched !== 1 ? "s" : ""} matched by name, alias, or pattern. Map the rest or leave
            them uncategorised.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="grid size-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-bg hover:text-fg"
        >
          <X size={16} />
        </button>
      </header>

      <div className="grid gap-4 px-5 py-5">
        {[...groups.entries()].map(([key, refs]) => (
          <UnmatchedRow
            key={key}
            name={refs[0].name}
            count={refs.length}
            items={items}
            choice={choices.get(key)!}
            onPick={(itemId) => onPick(key, itemId)}
            onLeave={() => setChoice(key, { itemId: null, category: null })}
            onToggleAlias={() => {
              const c = choices.get(key)!;
              setChoice(key, { saveAlias: !c.saveAlias });
            }}
          />
        ))}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-surface px-5 py-4">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="rounded-xl border border-border px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button type="button" onClick={submit} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-surface">
          Import with mapping
        </button>
      </footer>
    </dialog>
  );
}

function UnmatchedRow({
  name,
  count,
  items,
  choice,
  onPick,
  onLeave,
  onToggleAlias,
}: {
  name: string;
  count: number;
  items: ReturnType<typeof allInventoryItems>;
  choice: RowChoice;
  onPick: (itemId: string) => void;
  onLeave: () => void;
  onToggleAlias: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-3">
      <p className="text-sm font-medium">
        {name}
        {count > 1 && <span className="ml-2 text-xs font-normal text-muted">×{count} on this import</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={choice.itemId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onLeave();
            else onPick(v);
          }}
          className="min-w-48 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">Leave uncategorised</option>
          {items.map(({ item, category }) => (
            <option key={item.id} value={item.id}>
              {item.name} ({category})
            </option>
          ))}
        </select>
      </div>
      {choice.itemId && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={choice.saveAlias} onChange={onToggleAlias} />
          Save &ldquo;{name}&rdquo; as an alias on the chosen item
        </label>
      )}
    </div>
  );
}
