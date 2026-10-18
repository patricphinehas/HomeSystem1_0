"use client";

import { useEffect, useState } from "react";
import { CheckCircle, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { COMMON_LOCALES, currencies, currencyLabel, localeLabel, timezones } from "@/lib/region";
import { Card, Notice, Skeleton, Tabs } from "../ui";
import { PageGrid, PageHeader, Span } from "../page-frame";
import { ThemeToggle } from "../theme";
import { FamilyTab } from "./family";

type Field = {
  key: string;
  group: "user" | "region" | "database" | "inference";
  label: string;
  hint?: string;
  secret?: boolean;
  restart?: boolean;
  choices?: string[];
  placeholder?: string;
  options?: "locale" | "timezone" | "currency";
  value: string;
  set: boolean;
};

type Option = { value: string; label: string; group?: string };

/**
 * The long lists, built here from Intl instead of being sent by the API —
 * 418 timezones would be 20KB on a route the sidebar fetches on every page.
 * Built once and kept, because each one is a few hundred Intl lookups.
 */
const LISTS: Record<string, () => Option[]> = {
  locale: () => COMMON_LOCALES.map((tag) => ({ value: tag, label: localeLabel(tag) })),
  currency: () => currencies().map((code) => ({ value: code, label: currencyLabel(code) })),
  // Grouped by the part before the slash, so 418 zones are navigable.
  timezone: () =>
    timezones().map((zone) => ({ value: zone, label: zone.replace(/_/g, " "), group: zone.split("/")[0] })),
};

const EMPTY_LABEL: Record<string, string> = {
  locale: "not set — en-IN",
  currency: "not set — INR",
  timezone: "not set — wherever this is being read",
};

const cache = new Map<string, Option[]>();
const optionsFor = (kind: string, current: string) => {
  if (!cache.has(kind)) cache.set(kind, LISTS[kind]?.() ?? []);
  const list = cache.get(kind)!;
  // Whatever is configured is always offered back, even when it is not on the
  // list — an unusual tag typed into .env must not vanish on the next save.
  return current && !list.some((o) => o.value === current) ? [{ value: current, label: current }, ...list] : list;
};

type Settings = {
  fields: Field[];
  chatProvider: string;
  database: { target: string; ok: boolean; server?: string; error?: string; counts?: Record<string, number> };
};

/**
 * One tab each. `group` names the `.env` fields that belong to a tab; the two
 * tabs without one are not `.env` at all — family is its own collection and
 * the theme never leaves the browser.
 */
const TABS = [
  { id: "user", group: "user", title: "You", subtitle: "Who this copy of Home System belongs to." },
  { id: "family", title: "Family", subtitle: "Who lives here. Stored in the database, saved as you type." },
  {
    id: "region",
    group: "region",
    title: "Region",
    subtitle: "How dates, numbers and money are written, and what \"today\" means.",
  },
  { id: "database", group: "database", title: "Database", subtitle: "Where everything is stored. Written to .env." },
  {
    id: "inference",
    group: "inference",
    title: "Inference",
    subtitle: "The model behind the chat window on the MCP page.",
  },
  { id: "appearance", title: "Appearance", subtitle: "Stored in this browser only, never in .env." },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; restart: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabId>("user");

  const load = () =>
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((data: Settings) => {
        setSettings(data);
        setDraft(Object.fromEntries(data.fields.map((f) => [f.key, f.value])));
      })
      .catch(() => setError("Could not load settings. Is the data API running on :4000?"));

  useEffect(() => {
    load();
  }, []);

  const dirty = settings ? settings.fields.filter((f) => (draft[f.key] ?? "") !== f.value).map((f) => f.key) : [];

  /** Which tabs are holding an unsaved change, so a dot can say so. */
  const dirtyGroups = new Set(
    dirty.map((key) => settings?.fields.find((f) => f.key === key)?.group).filter(Boolean) as string[],
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const changes = Object.fromEntries(dirty.map((key) => [key, draft[key] ?? ""]));
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? response.statusText);
      setSaved({ count: body.saved.length, restart: body.restart });
      await load();
    } catch (e) {
      setError((e as Error).message || "Not saved.");
    } finally {
      setSaving(false);
    }
  };

  const current = TABS.find((t) => t.id === tab)!;
  // The theme and the family list save themselves; only .env needs the button.
  const needsSaveBar = "group" in current;

  return (
    <PageGrid>
      <PageHeader title="Settings" hint="Everything but the family list and the theme is written to .env." />

      {error && (
        <Span>
          <Notice>{error}</Notice>
        </Span>
      )}
      {saved && (
        <Span>
          <Notice tone={saved.restart.length ? "warn" : "accent"}>
            {saved.count === 0
              ? "Nothing to save."
              : saved.restart.length
                ? `Saved. ${saved.restart.join(", ")} is read at startup — restart the data API (mise run develop) for it to take effect.`
                : `Saved ${saved.count} setting${saved.count === 1 ? "" : "s"}. Live now.`}
          </Notice>
        </Span>
      )}

      {!settings && !error && (
        <Span>
          <Skeleton rows={3} />
        </Span>
      )}

      {settings && (
        <Span>
          <Tabs
            label="Settings sections"
            current={tab}
            onChange={setTab}
            tabs={TABS.map((item) => ({
              id: item.id,
              title: item.title,
              dot: "group" in item && dirtyGroups.has(item.group),
            }))}
          />
        </Span>
      )}

      {settings && (
        <Span>
          <Card
            dense
            title={current.title}
            subtitle={current.subtitle}
            aside={tab === "database" ? <DatabaseStatus database={settings.database} /> : undefined}
          >
            {tab === "family" ? (
              <FamilyTab me={draft.USER_NAME ?? ""} />
            ) : tab === "appearance" ? (
              <ThemeToggle />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {settings.fields
                  .filter((field) => "group" in current && field.group === current.group)
                  .map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={draft[field.key] ?? ""}
                      onChange={(value) => setDraft((d) => ({ ...d, [field.key]: value }))}
                    />
                  ))}
              </div>
            )}
          </Card>
        </Span>
      )}

      {settings && needsSaveBar && (
        <Span>
          <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty.length || saving}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-surface disabled:opacity-40"
            >
              <FloppyDisk size={15} weight="bold" />
              {saving ? "Saving..." : "Save to .env"}
            </button>
            <span className="text-xs text-muted">
              {dirty.length
                ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}${
                    dirtyGroups.size > 1 ? " across more than one tab" : ""
                  }`
                : "No changes"}
            </span>
          </div>
        </Span>
      )}
    </PageGrid>
  );
}

function DatabaseStatus({ database }: { database: Settings["database"] }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
        database.ok ? "bg-accent-soft text-accent" : "bg-warn-soft text-warn"
      }`}
      title={database.error ?? database.server}
    >
      {database.ok ? <CheckCircle size={13} weight="fill" /> : <WarningCircle size={13} weight="fill" />}
      <span className="font-mono">{database.target}</span>
      {database.counts && (
        <span>
          · {database.counts.items} items, {database.counts.bills} bills
        </span>
      )}
    </span>
  );
}

/** Keeps each group's options together and in the order they arrived. */
function groupOptions(list: Option[]): [string | undefined, Option[]][] {
  const groups = new Map<string | undefined, Option[]>();
  for (const option of list) groups.set(option.group, [...(groups.get(option.group) ?? []), option]);
  return [...groups.entries()];
}

function FieldRow({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  const inputClass = "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted";

  return (
    <label className="grid content-start gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-sm">
        {field.label}
        <code className="font-mono text-[11px] text-muted">{field.key}</code>
        {field.secret && field.set && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">set</span>
        )}
        {field.restart && <span className="text-[11px] text-muted">restart needed</span>}
      </span>

      {field.options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{EMPTY_LABEL[field.options] ?? "not set"}</option>
          {groupOptions(optionsFor(field.options, value)).map(([group, list]) =>
            group ? (
              <optgroup key={group} label={group}>
                {list.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              list.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ),
          )}
        </select>
      ) : field.choices ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">not set</option>
          {field.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.secret ? "password" : "text"}
          value={value}
          autoComplete={field.secret ? "new-password" : "off"}
          placeholder={field.secret && field.set ? "unchanged — type to replace" : field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${field.secret ? "font-mono" : ""}`}
        />
      )}

      {field.hint && <span className="text-xs text-muted">{field.hint}</span>}
    </label>
  );
}
