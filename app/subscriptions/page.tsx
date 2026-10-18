"use client";

import { useMemo, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { allTags, newId } from "@/lib/inventory";
import { normalizeSubscriptions, type Subscription } from "@/lib/subscriptions";
import { useInventory } from "../use-inventory";
import { useSubscriptions } from "../use-subscriptions";
import { Card, Notice, Skeleton } from "../ui";

const TYPES = ["streaming", "software", "news", "cloud", "utility", "membership", "other"];

export default function SubscriptionsPage() {
  const { doc, error, save } = useSubscriptions();
  const { inv } = useInventory();
  const [localError, setLocalError] = useState<string | null>(null);

  const tagSuggestions = useMemo(() => (inv ? allTags(inv) : []), [inv]);

  const patch = (id: string, next: Subscription | null) => {
    if (!doc) return;
    const subscriptions = next
      ? doc.subscriptions.map((s) => (s.id === id ? next : s))
      : doc.subscriptions.filter((s) => s.id !== id);
    const check = normalizeSubscriptions({ subscriptions });
    if ("error" in check) {
      setLocalError(check.error);
      return;
    }
    setLocalError(null);
    save(check.doc);
  };

  const add = (name: string) => {
    if (!doc || !name.trim()) return;
    const sub: Subscription = {
      id: newId(),
      name: name.trim(),
      type: "streaming",
      tag: "",
      holder: "",
      shareable: false,
      shareCount: null,
    };
    save({ subscriptions: [...doc.subscriptions, sub] });
  };

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted">
          Services the household pays for — type, tag, who holds it, and whether the plan is shared.
        </p>
      </header>

      {(error || localError) && <Notice>{localError ?? error}</Notice>}
      {!doc && !error && <Skeleton />}

      {doc && (
        <Card
          title="All subscriptions"
          subtitle={`${doc.subscriptions.length} on record`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="pb-2 pr-2 font-normal">Name</th>
                  <th className="pb-2 pr-2 font-normal">Type</th>
                  <th className="pb-2 pr-2 font-normal">Tag</th>
                  <th className="pb-2 pr-2 font-normal">Who has it</th>
                  <th className="pb-2 pr-2 font-normal">Shareable</th>
                  <th className="pb-2 pr-2 font-normal">Seats</th>
                  <th className="pb-2 w-10 font-normal" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {doc.subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted">
                      No subscriptions yet. Add one below.
                    </td>
                  </tr>
                )}
                {doc.subscriptions.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    tagSuggestions={tagSuggestions}
                    onChange={(next) => patch(sub.id, next)}
                    onDelete={() => patch(sub.id, null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <AddRow tagSuggestions={tagSuggestions} onAdd={add} />
        </Card>
      )}
    </div>
  );
}

function SubscriptionRow({
  sub,
  tagSuggestions,
  onChange,
  onDelete,
}: {
  sub: Subscription;
  tagSuggestions: string[];
  onChange: (next: Subscription) => void;
  onDelete: () => void;
}) {
  const inputClass = "w-full min-w-0 rounded-lg border border-border bg-bg px-2 py-1.5 text-sm";

  return (
    <tr>
      <td className="py-2 pr-2">
        <input
          value={sub.name}
          onChange={(e) => onChange({ ...sub, name: e.target.value })}
          className={inputClass}
          aria-label="Subscription name"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          list="subscription-types"
          value={sub.type}
          onChange={(e) => onChange({ ...sub, type: e.target.value })}
          className={inputClass}
          aria-label="Type"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          list="subscription-tags"
          value={sub.tag}
          onChange={(e) => onChange({ ...sub, tag: e.target.value })}
          className={inputClass}
          aria-label="Tag"
          placeholder="optional"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={sub.holder}
          onChange={(e) => onChange({ ...sub, holder: e.target.value })}
          className={inputClass}
          aria-label="Who has it"
          placeholder="Who uses or pays"
        />
      </td>
      <td className="py-2 pr-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sub.shareable}
            onChange={(e) =>
              onChange({
                ...sub,
                shareable: e.target.checked,
                shareCount: e.target.checked ? sub.shareCount ?? 2 : null,
              })
            }
          />
          <span className="text-xs text-muted">{sub.shareable ? "Yes" : "No"}</span>
        </label>
      </td>
      <td className="py-2 pr-2">
        {sub.shareable ? (
          <input
            type="number"
            min={1}
            step={1}
            value={sub.shareCount ?? ""}
            onChange={(e) =>
              onChange({
                ...sub,
                shareCount: Math.max(1, Number(e.target.value) || 1),
              })
            }
            className="w-16 rounded-lg border border-border bg-bg px-2 py-1.5 text-center font-mono text-sm tabular-nums"
            aria-label="Number of shared seats"
          />
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="py-2">
        <button
          type="button"
          aria-label={`Delete ${sub.name}`}
          onClick={onDelete}
          className="grid size-8 place-items-center rounded-xl text-muted hover:text-warn"
        >
          <Trash size={15} />
        </button>
      </td>
    </tr>
  );
}

function AddRow({ tagSuggestions, onAdd }: { tagSuggestions: string[]; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <>
      <datalist id="subscription-types">
        {TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="subscription-tags">
        {tagSuggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <form
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(name);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New subscription name"
          className="min-w-48 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          <Plus size={14} weight="bold" />
          Add
        </button>
      </form>
    </>
  );
}
