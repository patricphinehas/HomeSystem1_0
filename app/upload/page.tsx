"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Check, ClipboardText, Copy, Plus, Receipt, TrendUp, Trash, UploadSimple } from "@phosphor-icons/react";
import type { Analytics } from "@/lib/analytics";
import { itemKey } from "@/lib/analytics";
import {
  MAX_IMPORT,
  compareWithHistory,
  normalizeBill,
  validateImportJson,
  sampleJson,
  today,
  type BillInput,
  type PriceRef,
  type StoredBill,
} from "@/lib/bill";
import { inr, perUnit, pct } from "@/lib/money";
import { COMMON_UNITS, cheapest, unitPrice } from "@/lib/units";
import { applyInventoryMatch, matchInventoryLine, unmatchedImportLines } from "@/lib/match-inventory";
import type { Inventory } from "@/lib/inventory";
import { BillDetail } from "../bill-detail";
import { ImportMapDialog } from "../import-map-dialog";
import { useInventory } from "../use-inventory";
import { useJson } from "../use-api";
import { Card, Notice } from "../ui";

type Row = { id: number; name: string; qty: string; unit: string; cost: string };

let nextRowId = 1;
const blankRow = (unit = "kg"): Row => ({ id: nextRowId++, name: "", qty: "", unit, cost: "" });

type Verdict = ReturnType<typeof compareWithHistory>["verdict"];

const VERDICT: Record<Verdict, { label: (p: { vsLast?: number; vsBest?: number }) => string; tone: string }> = {
  best: { label: () => "Best price yet", tone: "text-accent" },
  cheaper: { label: (p) => `${pct(p.vsLast)} vs last`, tone: "text-accent" },
  same: { label: () => "Same as last time", tone: "text-muted" },
  pricier: { label: (p) => `${pct(p.vsLast)} vs last`, tone: "text-warn" },
  new: { label: () => "First time bought", tone: "text-muted" },
};

export default function EnterBill() {
  const { inv, save: saveInventory } = useInventory();
  const { data: analytics, reload: reloadPrices } = useJson<Analytics>("/api/analytics");
  const { data: recent, error: recentError, reload: reloadBills } = useJson<{ bills: StoredBill[] }>("/api/bills?limit=8");

  // Deferred to an effect: with cacheComponents on, reading the clock during a
  // client component's prerender is an error (the value would be baked in).
  const [date, setDate] = useState("");
  useEffect(() => setDate(today()), []);

  const [store, setStore] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ total: number; comparisons: Comparison[] } | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [viewBill, setViewBill] = useState<StoredBill | null>(null);

  const inventory = inv ?? { categories: [] };

  const linkName = (name: string) => {
    const hit = matchInventoryLine(name, inventory);
    if (!hit) return undefined;
    const item = inventory.categories.flatMap((c) => c.items).find((i) => i.id === hit.itemId);
    return { itemId: hit.itemId, category: hit.category, unit: item?.unit ?? "kg" };
  };

  const names = useMemo(
    () => (inv?.categories ?? []).flatMap((c) => c.items.map((i) => i.name)).sort(),
    [inv],
  );

  const priceBook = (analytics?.priceBook ?? {}) as Record<string, PriceRef>;
  const units = [
    ...new Set([
      ...COMMON_UNITS,
      ...inventory.categories.flatMap((c) => c.items.map((i) => i.unit)),
    ]),
  ];
  const stores = [...new Set((recent?.bills ?? []).map((b) => b.store))];

  const priced = rows.map((row) => {
    const match = linkName(row.name);
    const price = unitPrice(Number(row.qty), row.unit, Number(row.cost));
    return { row, match, price, cost: Number(row.cost) || 0 };
  });

  // Same item twice in one bill (a 500 g pouch and a 5 kg sack): flag which
  // size actually costs less per kg.
  const bestInBill = new Map<string, number>();
  for (const key of new Set(priced.map((p) => itemKey(p.row.name)).filter(Boolean))) {
    const options = priced.filter((p) => itemKey(p.row.name) === key && p.price);
    if (options.length < 2) continue;
    const best = cheapest(options.map((o) => ({ id: o.row.id, base: o.price!.base, price: o.price!.price })));
    if (best) bestInBill.set(key, best.id);
  }

  const total = priced.reduce((t, p) => t + (Number.isFinite(p.cost) ? p.cost : 0), 0);
  const filled = rows.filter((r) => r.name.trim() !== "");

  const patch = (id: number, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const onName = (id: number, name: string) => {
    const match = linkName(name);
    // Adopt the inventory's unit for a known item, unless the row was edited.
    patch(id, match ? { name, unit: match.unit } : { name });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const draft: BillInput = {
      date,
      store,
      note,
      items: filled.map(({ name, qty, unit, cost }) => {
        const match = linkName(name);
        return { name, qty, unit, cost, itemId: match?.itemId ?? null, category: match?.category ?? null };
      }),
    };

    // The API validates too; checking here first keeps the error next to the field.
    const check = normalizeBill(draft);
    if ("error" in check) return setError(check.error);

    setSaving(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || res.statusText);

      setSaved({ total: body.bill.total, comparisons: body.comparisons });
      setRows([blankRow()]);
      setNote("");
      reloadPrices();
      reloadBills();
    } catch (err) {
      setError((err as Error).message || "Could not save the bill.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Enter bill</h1>
        <p className="mt-1 text-sm text-muted">
          Quantity, unit and what you paid. Everything is reduced to a price per kg, litre or piece, so
          today&rsquo;s shop can be compared with the last one.
        </p>
      </header>

      {error && <Notice>{error}</Notice>}

      <ImportBills
        date={date}
        inv={inv}
        onSaveInventory={saveInventory}
        onImported={(summary) => {
          setImported(summary);
          setError(null);
          reloadPrices();
          reloadBills();
        }}
        onError={(message) => {
          setImported(null);
          setError(message);
        }}
        imported={imported}
      />

      {viewBill && <BillDetail bill={viewBill} onClose={() => setViewBill(null)} />}

      {saved && (
        <Card
          title="Bill saved"
          subtitle={`${inr(saved.total, 2)} · ${saved.comparisons.length} items`}
          aside={
            <Link href="/analytics" className="text-sm text-accent hover:underline">
              See analytics
            </Link>
          }
        >
          <ul className="grid gap-1.5 text-sm">
            {saved.comparisons.map((c) => (
              <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {c.verdict === "best" && <CheckCircle size={14} className="text-accent" aria-hidden />}
                  {c.verdict === "pricier" && <TrendUp size={14} className="text-warn" aria-hidden />}
                  {c.name}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {perUnit(c.unitPrice, c.base)}
                  <span className={`ml-2 ${VERDICT[c.verdict].tone}`}>{VERDICT[c.verdict].label(c)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="grid gap-1 text-xs text-muted">
            Bill date
            <input
              type="date"
              required
              max={date || undefined}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Shop
            <input
              required
              list="store-suggestions"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Where did you buy this?"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted"
            />
            <datalist id="store-suggestions">
              {stores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-muted">
            <span>Items</span>
            <span className="hidden sm:block">quantity · unit · what you paid</span>
          </div>

          <ul>
            {priced.map(({ row, match, price }) => {
              const ref = priceBook[itemKey(row.name)];
              const comparison = price ? compareWithHistory({ base: price.base, unitPrice: price.price }, ref) : null;
              const isBestInBill = bestInBill.get(itemKey(row.name)) === row.id;

              return (
                <li key={row.id} className="border-t border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Item"
                      list="item-suggestions"
                      value={row.name}
                      onChange={(e) => onName(row.id, e.target.value)}
                      placeholder="Item"
                      className="min-w-32 flex-1 rounded-xl border border-border bg-bg px-3 py-1.5 text-sm placeholder:text-muted"
                    />
                    <input
                      aria-label={`Quantity of ${row.name || "item"}`}
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => patch(row.id, { qty: e.target.value })}
                      placeholder="qty"
                      className="w-20 rounded-xl border border-border bg-bg px-2 py-1.5 text-center font-mono text-sm tabular-nums placeholder:font-sans placeholder:text-muted"
                    />
                    <input
                      aria-label={`Unit for ${row.name || "item"}`}
                      list="unit-suggestions"
                      value={row.unit}
                      onChange={(e) => patch(row.id, { unit: e.target.value })}
                      className="w-20 rounded-xl border border-border bg-bg px-2 py-1.5 text-center text-sm"
                    />
                    <input
                      aria-label={`Amount paid for ${row.name || "item"}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.cost}
                      onChange={(e) => patch(row.id, { cost: e.target.value })}
                      placeholder="₹"
                      className="w-24 rounded-xl border border-border bg-bg px-2 py-1.5 text-right font-mono text-sm tabular-nums placeholder:font-sans placeholder:text-muted"
                    />
                    <button
                      type="button"
                      aria-label="Remove this line"
                      disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                      className="grid size-8 place-items-center rounded-xl text-muted hover:text-warn disabled:opacity-30"
                    >
                      <Trash size={15} />
                    </button>
                  </div>

                  {price && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs">
                      <span className="font-mono tabular-nums">{perUnit(price.price, price.base)}</span>
                      {comparison && (
                        <span className={VERDICT[comparison.verdict].tone}>
                          {VERDICT[comparison.verdict].label(comparison)}
                          {ref && comparison.verdict !== "new" && (
                            <span className="ml-1 text-muted">
                              (best {perUnit(ref.best, ref.base)}, last {perUnit(ref.last, ref.base)})
                            </span>
                          )}
                        </span>
                      )}
                      {isBestInBill && <span className="text-accent">cheapest size on this bill</span>}
                      {!price.known && <span className="text-muted">priced per {price.base}</span>}
                      {!match && row.name.trim() && <span className="text-muted">not in inventory</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <datalist id="item-suggestions">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="unit-suggestions">
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg px-3 py-3">
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, blankRow(rs[rs.length - 1]?.unit)])}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm transition active:scale-[0.98]"
            >
              <Plus size={14} weight="bold" />
              Add item
            </button>
            <p className="text-sm text-muted">
              Bill total <span className="ml-1 font-mono text-base tabular-nums text-fg">{inr(total, 2)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={saving || filled.length === 0}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-surface transition active:scale-[0.98] disabled:opacity-40"
          >
            <Receipt size={16} />
            {saving ? "Saving…" : `Save bill (${filled.length})`}
          </button>
        </div>
      </form>

      <Card
        title="Recent bills"
        subtitle={recent ? `${recent.bills.length} most recent` : "Loading…"}
        aside={
          <Link href="/analytics" className="text-sm text-accent hover:underline">
            Analytics
          </Link>
        }
      >
        {recentError && <Notice>{recentError}</Notice>}
        {recent?.bills.length === 0 && <p className="text-sm text-muted">No bills yet. The first one starts the price history.</p>}
        {recent && recent.bills.length > 0 && (
          <ul className="divide-y divide-border">
            {recent.bills.map((bill) => (
              <li key={bill.id} className="first:pt-0">
                <button
                  type="button"
                  onClick={() => setViewBill(bill)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-lg py-2 text-left text-sm transition hover:bg-bg"
                >
                  <span>
                    {bill.store}
                    <span className="ml-2 text-xs text-muted">
                      {bill.date} · {bill.items.length} items
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">{inr(bill.total, 2)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

type Comparison = {
  name: string;
  unitPrice: number;
  base: string;
  verdict: Verdict;
  vsBest?: number;
  vsLast?: number;
};

type Imported = { imported: number; items: number; total: number; from: string; to: string };

/**
 * Bulk entry: a JSON file of bills, in the same shape the API already takes.
 * The file is validated here with the same `normalizeBills` the server uses, so
 * a malformed file names the offending bill before anything is sent.
 */
function ImportBills({
  date,
  inv,
  onSaveInventory,
  onImported,
  onError,
  imported,
}: {
  date: string;
  inv: Inventory | null;
  onSaveInventory: (next: Inventory) => void;
  onImported: (summary: Imported) => void;
  onError: (message: string) => void;
  imported: Imported | null;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [mapBills, setMapBills] = useState<BillInput[] | null>(null);
  const [batchImport, setBatchImport] = useState(true);

  const copySample = async () => {
    await navigator.clipboard.writeText(sampleJson(date || undefined));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pasteSchema = useMemo(() => {
    const raw = paste.trim();
    if (!raw) return null;
    const check = validateImportJson(raw, "Pasted text is not valid JSON.");
    if ("error" in check) return { ok: false as const, error: check.error };
    const items = check.bills.reduce((n, b) => n + b.items.length, 0);
    return { ok: true as const, bills: check.bills.length, items };
  }, [paste]);

  const pasteFromClipboard = async () => {
    try {
      setPaste(await navigator.clipboard.readText());
    } catch {
      onError("Could not read the clipboard. Paste into the box manually, or allow clipboard access.");
    }
  };

  const postBills = async (inputs: BillInput[], asArray: boolean, nextInv: Inventory | null) => {
    if (nextInv) onSaveInventory(nextInv);
    setBusy(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(asArray ? inputs : inputs[0]),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || res.statusText);

      onImported(body as Imported);
      setPaste("");
      setMapBills(null);
    } catch (err) {
      onError((err as Error).message || "Could not import that JSON.");
    } finally {
      setBusy(false);
    }
  };

  const beginImport = (raw: string, invalidMessage: string) => {
    const trimmed = raw.trim();
    const check = validateImportJson(trimmed, invalidMessage);
    if ("error" in check) {
      onError(check.error);
      return;
    }

    const parsed: unknown = JSON.parse(trimmed);
    const asArray = Array.isArray(parsed);
    const inputs = (asArray ? parsed : [parsed]) as BillInput[];
    const inventory = inv ?? { categories: [] };

    const unmatched = unmatchedImportLines(inputs, inventory);

    setBatchImport(asArray);
    if (unmatched.size > 0) {
      if (!inv) {
        onError("Inventory is still loading. Try the import again in a moment.");
        return;
      }
      setMapBills(inputs);
      return;
    }
    void postBills(applyInventoryMatch(inputs, inventory), asArray, null);
  };

  const submitJson = (raw: string, invalidMessage: string) => beginImport(raw, invalidMessage);

  const upload = async (file: File) => {
    await submitJson(await file.text(), `${file.name} is not valid JSON.`);
  };

  return (
    <>
      {mapBills && inv && (
        <ImportMapDialog
          bills={mapBills}
          inv={inv}
          onCancel={() => setMapBills(null)}
          onConfirm={(mapped, nextInv) => void postBills(mapped, batchImport, nextInv)}
        />
      )}
    <Card
      title="Import bills from JSON"
      subtitle={`One bill as an object, or up to ${MAX_IMPORT} as an array. Nothing is stored unless every bill in the file is valid.`}
      aside={
        <button
          type="button"
          onClick={copySample}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm transition active:scale-[0.98]"
        >
          {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy sample"}
        </button>
      }
    >
      <div className="grid gap-3">
        {imported && (
          <Notice tone="accent">
            Imported {imported.imported} bill{imported.imported > 1 ? "s" : ""} · {imported.items} items ·{" "}
            {inr(imported.total, 2)} · {imported.from} to {imported.to}
          </Notice>
        )}

        <div
          className="grid gap-3 rounded-xl border border-dashed border-border bg-bg p-4"
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim()) {
              e.preventDefault();
              setPaste(text);
            }
          }}
        >
          <p className="text-sm text-fg">
            Upload a <code className="text-xs">.json</code> file, paste from the clipboard, or edit JSON below. Lines are
            matched to inventory by name, alias, or regex pattern; anything else can be mapped before import.
          </p>

          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg transition hover:border-accent active:scale-[0.98]">
              <UploadSimple size={18} className="text-muted" />
              {busy ? "Importing…" : "Choose file"}
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pasteFromClipboard()}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg transition hover:border-accent active:scale-[0.98] disabled:opacity-40"
            >
              <ClipboardText size={18} />
              Paste from clipboard
            </button>
            <button
              type="button"
              disabled={busy || !pasteSchema?.ok}
              onClick={() => void submitJson(paste.trim(), "Pasted text is not valid JSON.")}
              className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-surface transition active:scale-[0.98] disabled:opacity-40"
            >
              <UploadSimple size={18} weight="bold" />
              {busy ? "Importing…" : "Import JSON"}
            </button>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={busy}
            rows={6}
            spellCheck={false}
            aria-label="Bill import JSON"
            placeholder='[{"date":"2026-10-01","store":"…","items":[{"name":"…","qty":1,"unit":"kg","cost":100}]}]'
            className="min-h-32 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg placeholder:text-muted"
          />

          {pasteSchema ? (
            pasteSchema.ok ? (
              <Notice tone="accent">
                Schema OK — {pasteSchema.bills} bill{pasteSchema.bills > 1 ? "s" : ""}, {pasteSchema.items} item
                {pasteSchema.items !== 1 ? "s" : ""}
              </Notice>
            ) : (
              <Notice>{pasteSchema.error}</Notice>
            )
          ) : (
            <p className="text-xs text-muted">Paste or type JSON here — validation runs as you edit.</p>
          )}
        </div>

        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none hover:text-fg">What the file has to contain</summary>
          <ul className="mt-2 grid gap-1 pl-4">
            <li>
              <code>date</code> — yyyy-mm-dd, not in the future. Required.
            </li>
            <li>
              <code>store</code> — where you bought it. Required.
            </li>
            <li>
              <code>note</code> — optional, up to 500 characters.
            </li>
            <li>
              <code>items[]</code> — at least one, each with <code>name</code>, <code>qty</code> (&gt; 0),{" "}
              <code>unit</code> (kg, g, pcs, L, ml, dozen, or anything else — an unrecognised unit is priced per
              itself) and <code>cost</code> (the line total you paid, not the per-unit price).
            </li>
            <li>
              <code>items[].itemId</code> — optional explicit link. Otherwise names match inventory items, their{" "}
              <code>aliases</code>, or <code>patterns</code> (regex). Unmatched lines can be mapped on import.
            </li>
          </ul>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 text-[11px] leading-relaxed text-fg">
            {sampleJson(date || undefined)}
          </pre>
        </details>
      </div>
    </Card>
    </>
  );
}
