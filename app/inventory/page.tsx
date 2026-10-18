"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChartLine, Copy, Trash, Warning } from "@phosphor-icons/react";
import type { Analytics } from "@/lib/analytics";
import { allTags, isLow, lowStock, newId, type Category, type Inventory, type Item } from "@/lib/inventory";
import { useInventory } from "../use-inventory";
import { useJson } from "../use-api";
import { Notice, Skeleton, Stepper, TagEditor } from "../ui";

// Pulls in the chart library, so it loads when a history is first opened.
const ItemHistory = dynamic(() => import("../item-history").then((m) => m.ItemHistory), { ssr: false });

const BUY = "buy-next";

export default function InventoryPage() {
  const { inv, error, save } = useInventory();
  const [tab, setTab] = useState(BUY);
  const [newCategory, setNewCategory] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<{ item: Item; category: string } | null>(null);
  // Purchase lines are only needed once a history has been opened, and they
  // stay loaded afterwards so reopening is instant.
  const [wantLines, setWantLines] = useState(false);
  const { data: analytics, loading } = useJson<Analytics>(wantLines ? "/api/analytics" : null);

  const openHistory = (item: Item, category: string) => {
    setWantLines(true);
    setHistory({ item, category });
  };

  // Leaving the tab abandons a pending delete rather than leaving it armed.
  const selectTab = (id: string) => {
    setConfirmDelete(false);
    setTab(id);
  };

  const patchItem = (categoryId: string, itemId: string, next: Item | null) =>
    save({
      categories: inv!.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              items: next
                ? c.items.map((i) => (i.id === itemId ? next : i))
                : c.items.filter((i) => i.id !== itemId),
            }
          : c,
      ),
    } satisfies Inventory);

  const patchCategory = (id: string, fn: (c: Category) => Category) =>
    save({ categories: inv!.categories.map((c) => (c.id === id ? fn(c) : c)) });

  const low = inv ? lowStock(inv) : [];
  const active = inv?.categories.find((c) => c.id === tab);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory management</h1>
        <p className="mt-1 text-sm text-muted">
          One tab per category. An item joins Buy next the moment its count hits its minimum.
        </p>
      </header>

      {error && <Notice>{error}</Notice>}
      {!inv && !error && <Skeleton />}

      {inv && (
        <>
          <div role="tablist" aria-label="Categories" className="flex flex-wrap items-center gap-1.5">
            <Tab id={BUY} active={tab === BUY} onSelect={selectTab} count={low.length} alert>
              Buy next
            </Tab>
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            {inv.categories.map((c) => (
              <Tab key={c.id} id={c.id} active={tab === c.id} onSelect={selectTab} count={c.items.length}>
                {c.name}
              </Tab>
            ))}
          </div>

          {tab === BUY && (
            <BuyNext
              items={low}
              onQty={(categoryId, itemId, qty) =>
                patchCategory(categoryId, (c) => ({
                  ...c,
                  items: c.items.map((i) => (i.id === itemId ? { ...i, qty } : i)),
                }))
              }
            />
          )}

          {active && (
            <section role="tabpanel" aria-label={active.name} className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <input
                  aria-label="Category name"
                  value={active.name}
                  onChange={(e) => patchCategory(active.id, (c) => ({ ...c, name: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-medium hover:bg-surface"
                />
                {confirmDelete ? (
                  <span role="status" className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-warn">
                      Delete {active.name || "this category"}
                      {active.items.length > 0 &&
                        ` and its ${active.items.length} item${active.items.length > 1 ? "s" : ""}`}
                      ?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        setTab(BUY);
                        save({ categories: inv.categories.filter((c) => c.id !== active.id) });
                      }}
                      className="rounded-lg bg-warn-soft px-2 py-1 font-medium text-warn"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-1 py-1 text-muted hover:text-fg"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="shrink-0 text-xs text-muted hover:text-warn"
                  >
                    Delete category
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {active.items.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted">
                    Empty. Add the first thing you want to stop forgetting.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {active.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        tagSuggestions={allTags(inv)}
                        onChange={(next) => patchItem(active.id, item.id, next)}
                        onDelete={() => patchItem(active.id, item.id, null)}
                        onHistory={() => openHistory(item, active.name)}
                      />
                    ))}
                  </ul>
                )}
                <AddItem
                  category={active.name}
                  onAdd={(item) => patchCategory(active.id, (c) => ({ ...c, items: [...c.items, item] }))}
                />
              </div>
            </section>
          )}

          <form
            className="flex gap-2 border-t border-border pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCategory.trim();
              if (!name) return;
              const id = newId();
              save({ categories: [...inv.categories, { id, name, items: [] }] });
              setNewCategory("");
              setTab(id);
            }}
          >
            <label className="sr-only" htmlFor="category">
              Category name
            </label>
            <input
              id="category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category, e.g. Pet supplies"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-surface transition active:scale-[0.98]"
            >
              Add category
            </button>
          </form>
        </>
      )}

      {history && (
        <ItemHistory
          item={history.item}
          category={history.category}
          lines={analytics?.lines ?? []}
          loading={loading}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}

function Tab({
  id,
  active,
  onSelect,
  count,
  alert,
  children,
}: {
  id: string;
  active: boolean;
  onSelect: (id: string) => void;
  count: number;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition active:scale-[0.98] ${
        active
          ? "bg-accent-soft font-medium text-accent"
          : "border border-border bg-surface text-muted hover:text-fg"
      }`}
    >
      {children}
      <span
        className={`font-mono text-[11px] tabular-nums ${
          alert && count > 0 && !active ? "text-warn" : "opacity-60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function BuyNext({
  items,
  onQty,
}: {
  items: ReturnType<typeof lowStock>;
  onQty: (categoryId: string, itemId: string, qty: number) => void;
}) {
  // Picked-up ticks are for this one shopping trip, so they stay in component state.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  if (items.length === 0) {
    return (
      <p
        role="tabpanel"
        aria-label="Buy next"
        className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted"
      >
        Nothing to buy. Every tracked item is above its minimum.
      </p>
    );
  }

  const copyList = async () => {
    const text = items
      .map((i) => `${i.name} (${i.category}) - have ${i.qty} ${i.unit}, min ${i.min}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section role="tabpanel" aria-label="Buy next" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Tick items off at the shop, set the new count when you unpack.</p>
        <button
          type="button"
          onClick={copyList}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm transition active:scale-[0.98]"
        >
          {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy list"}
        </button>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {items.map((item) => {
          const done = picked.has(item.id);
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setPicked(next);
                  }}
                  className="size-4 shrink-0 accent-accent"
                />
                <span className={`min-w-0 truncate ${done ? "text-muted line-through" : ""}`}>
                  {item.name}
                  <span className="ml-2 text-xs text-muted">
                    {item.category}
                    {item.room && ` · ${item.room}`}
                  </span>
                </span>
              </label>
              <span className="font-mono text-xs tabular-nums text-warn">
                {item.qty} / {item.min} {item.unit}
              </span>
              <Stepper
                value={item.qty}
                unit={item.unit}
                label={item.name}
                onChange={(qty) => onQty(item.categoryId, item.id, qty)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ItemRow({
  item,
  tagSuggestions,
  onChange,
  onDelete,
  onHistory,
}: {
  item: Item;
  tagSuggestions: string[];
  onChange: (next: Item) => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {isLow(item) && <Warning size={15} className="shrink-0 text-warn" aria-label="Running low" />}
        <input
          aria-label={`Name of ${item.name}`}
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-0.5 hover:bg-bg"
        />
      </span>
      <input
        aria-label={`Where ${item.name} is kept`}
        value={item.room}
        onChange={(e) => onChange({ ...item, room: e.target.value })}
        placeholder="room"
        className="w-24 rounded-lg bg-transparent px-1 py-0.5 text-xs text-muted placeholder:text-muted hover:bg-bg"
      />
      <Stepper
        value={item.qty}
        unit={item.unit}
        label={item.name}
        onChange={(qty) => onChange({ ...item, qty })}
      />
      <label className="flex items-center gap-1.5 text-xs text-muted">
        min
        <input
          type="number"
          min={0}
          value={item.min}
          onChange={(e) => onChange({ ...item, min: Math.max(0, Number(e.target.value) || 0) })}
          className="w-14 rounded-xl border border-border bg-surface px-2 py-1.5 text-center font-mono text-sm tabular-nums text-fg"
        />
      </label>
      <button
        type="button"
        aria-label={`Purchase history for ${item.name}`}
        onClick={onHistory}
        className="grid size-8 place-items-center rounded-xl text-muted hover:bg-bg hover:text-accent"
      >
        <ChartLine size={15} />
      </button>
      <button
        type="button"
        aria-label={`Delete ${item.name}`}
        onClick={onDelete}
        className="grid size-8 place-items-center rounded-xl text-muted hover:text-warn"
      >
        <Trash size={15} />
      </button>
      <div className="grid w-full gap-2 pl-6">
        <TagEditor
          label={item.name}
          tags={item.tags ?? []}
          suggestions={tagSuggestions}
          onChange={(tags) => onChange({ ...item, tags })}
        />
        <TagEditor
          label="Bill aliases"
          tags={item.aliases ?? []}
          onChange={(aliases) => onChange({ ...item, aliases })}
        />
        <label className="grid gap-1 text-xs text-muted">
          Match patterns (regex, comma-separated)
          <input
            value={(item.patterns ?? []).join(", ")}
            onChange={(e) => {
              const patterns = e.target.value
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
              onChange({ ...item, patterns: patterns.length ? patterns : undefined });
            }}
            placeholder="tea\s*leaves?, britannia"
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-muted"
          />
        </label>
      </div>
    </li>
  );
}

function AddItem({ onAdd, category }: { onAdd: (item: Item) => void; category: string }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [unit, setUnit] = useState("pc");
  const [min, setMin] = useState(1);

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-border bg-bg px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onAdd({ id: newId(), name: trimmed, room: room.trim(), qty: 0, unit: unit.trim() || "pc", min });
        setName("");
      }}
    >
      <input
        aria-label={`New item in ${category}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item"
        className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm placeholder:text-muted"
      />
      <input
        aria-label="Room"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        placeholder="room"
        className="w-24 rounded-xl border border-border bg-surface px-2 py-1.5 text-sm placeholder:text-muted"
      />
      <input
        aria-label="Unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="w-16 rounded-xl border border-border bg-surface px-2 py-1.5 text-center text-sm"
      />
      <label className="flex items-center gap-1.5 text-xs text-muted">
        min
        <input
          aria-label="Minimum"
          type="number"
          min={0}
          value={min}
          onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))}
          className="w-14 rounded-xl border border-border bg-surface px-2 py-1.5 text-center font-mono text-sm tabular-nums text-fg"
        />
      </label>
      <button
        type="submit"
        className="rounded-xl border border-accent px-3 py-1.5 text-sm font-medium text-accent transition active:scale-[0.98]"
      >
        Add
      </button>
    </form>
  );
}
