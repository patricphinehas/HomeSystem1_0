"use client";

import { useState } from "react";
import { Minus, Plus, X } from "@phosphor-icons/react";
import { MAX_TAGS, addTag, cleanTag } from "@/lib/inventory";

export function Stepper({
  value,
  unit,
  onChange,
  label,
}: {
  value: number;
  unit: string;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        disabled={value === 0}
        onClick={() => onChange(value - 1)}
        className="grid size-8 place-items-center rounded-xl border border-border bg-surface transition active:scale-[0.96] disabled:opacity-40"
      >
        <Minus size={14} weight="bold" />
      </button>
      <input
        aria-label={`Quantity of ${label}`}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-14 rounded-xl border border-border bg-surface px-2 py-1.5 text-center font-mono text-sm tabular-nums"
      />
      <span className="w-10 shrink-0 text-xs text-muted">{unit}</span>
      <button
        type="button"
        aria-label={`Add one ${label}`}
        onClick={() => onChange(value + 1)}
        className="grid size-8 place-items-center rounded-xl border border-border bg-surface transition active:scale-[0.96]"
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}

/**
 * What every page, table and chart shows while its data is in flight.
 *
 * Still called Skeleton and still takes `rows`, because ~15 call sites pass
 * it: `rows` no longer draws grey blocks, it sets how much room the loader
 * reserves, so the page does not jump when the real content lands.
 */
export function Skeleton({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid place-items-center rounded-xl border border-border bg-surface p-6"
      style={{ minHeight: `${Math.min(Math.max(rows, 1), 6) * 3.5}rem` }}
    >
      <BarLoader />
      <span className="mt-3 text-xs text-muted">{label}...</span>
    </div>
  );
}

/** elijahgummer's bars (uiverse.io, MIT). The CSS is in globals.css. */
export function BarLoader({ height = 44 }: { height?: number }) {
  return (
    <span aria-hidden className="bar-loader" style={{ "--bar-height": `${height}px` } as React.CSSProperties}>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="bar-loader__bar" />
      ))}
    </span>
  );
}

/**
 * Nawsome's nine-box loader (uiverse.io, MIT), for the one wait that is long
 * enough to deserve something to look at: a model writing an answer.
 */
export function BanterLoader({ scale = 0.5 }: { scale?: number }) {
  return (
    <span
      aria-hidden
      className="block"
      style={{ width: 72 * scale, height: 72 * scale }}
    >
      <span className="banter-loader" style={{ "--loader-scale": scale } as React.CSSProperties}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="banter-loader__box" />
        ))}
      </span>
    </span>
  );
}

export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "accent" }) {
  return (
    <p
      role="status"
      className={`rounded-xl px-4 py-3 text-sm ${
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"
      }`}
    >
      {children}
    </p>
  );
}

export function Card({
  title,
  subtitle,
  aside,
  children,
  dense,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  /** Tighter padding for a multi-cell page, such as the analytics matrix. */
  dense?: boolean;
}) {
  return (
    <section className={`h-full min-w-0 rounded-xl border border-border bg-surface ${dense ? "p-3" : "p-4 md:p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      <div className={dense ? "mt-2" : "mt-4"}>{children}</div>
    </section>
  );
}

/** Small chip list with an add field. Tags are the grouping key on the analytics page. */
export function TagEditor({
  tags,
  onChange,
  label,
  suggestions = [],
  placeholder = "+ tag",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  label: string;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;

  const commit = (raw: string) => {
    const next = addTag(tags, raw);
    if (next !== tags) onChange(next);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-lg bg-accent-soft py-0.5 pr-1 pl-2 text-xs text-accent"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag} from ${label}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="grid size-4 place-items-center rounded hover:bg-surface"
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}
      {!full && (
        <input
          aria-label={`Add to ${label}, comma-separated`}
          list="tag-suggestions"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value))}
          onBlur={() => draft && commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            }
            if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          className="w-20 rounded-lg bg-transparent px-1.5 py-0.5 text-xs text-muted placeholder:text-muted hover:bg-bg focus:w-28"
        />
      )}
      <datalist id="tag-suggestions">
        {suggestions.filter((s) => !tags.includes(cleanTag(s))).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * A row of tabs. Used by /settings and /mcp, which are both one page holding
 * several unrelated things — the alternative was a long scroll of cards.
 * `dot` marks a tab with something waiting on it, such as an unsaved change.
 */
export function Tabs<T extends string>({
  tabs,
  current,
  onChange,
  label,
}: {
  tabs: readonly { id: T; title: string; dot?: boolean }[];
  current: T;
  onChange: (id: T) => void;
  /** What this set of tabs is for, for a screen reader. */
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={current === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
            current === tab.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {tab.title}
          {tab.dot && <span aria-label="unsaved changes" className="size-1.5 rounded-full bg-warn" />}
        </button>
      ))}
    </div>
  );
}
