"use client";

import { useEffect, useState } from "react";
import { CheckCircle, FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import { Card, Notice, Skeleton } from "../ui";
import { PageGrid, PageHeader, Span } from "../page-frame";
import { ThemeToggle } from "../theme";

type Field = {
  key: string;
  group: "user" | "database" | "inference";
  label: string;
  hint?: string;
  secret?: boolean;
  restart?: boolean;
  choices?: string[];
  placeholder?: string;
  value: string;
  set: boolean;
};

type Settings = {
  fields: Field[];
  chatProvider: string;
  database: { target: string; ok: boolean; server?: string; error?: string; counts?: Record<string, number> };
};

const GROUPS = [
  { id: "user", title: "User", subtitle: "Who this copy of Home System belongs to." },
  { id: "database", title: "Database", subtitle: "Where everything is stored. Written to .env." },
  { id: "inference", title: "Inference engine", subtitle: "The model behind the chat window on the MCP page." },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; restart: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

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

  const dirty = settings
    ? settings.fields.filter((f) => (draft[f.key] ?? "") !== f.value).map((f) => f.key)
    : [];

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

  return (
    <PageGrid>
      <PageHeader title="Settings" hint="Everything but the theme is written to .env in the project root." />

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

      <Card dense title="Appearance" subtitle="Stored in this browser only.">
        <ThemeToggle />
      </Card>

      {!settings && !error && (
        <Span>
          <Skeleton rows={3} />
        </Span>
      )}

      {settings && (
        <>
          {GROUPS.map((group) => (
            <Card
              dense
              key={group.id}
              title={group.title}
              subtitle={group.subtitle}
              aside={group.id === "database" ? <DatabaseStatus database={settings.database} /> : undefined}
            >
              <div className="grid gap-4">
                {settings.fields
                  .filter((field) => field.group === group.id)
                  .map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={draft[field.key] ?? ""}
                      onChange={(value) => setDraft((d) => ({ ...d, [field.key]: value }))}
                    />
                  ))}
              </div>
            </Card>
          ))}

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
              {dirty.length ? `${dirty.length} unsaved change${dirty.length === 1 ? "" : "s"}` : "No changes"}
            </span>
          </div>
          </Span>
        </>
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
      {database.counts && <span>· {database.counts.items} items, {database.counts.bills} bills</span>}
    </span>
  );
}

function FieldRow({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  const inputClass = "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted";

  return (
    <label className="grid gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-sm">
        {field.label}
        <code className="font-mono text-[11px] text-muted">{field.key}</code>
        {field.secret && field.set && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">set</span>
        )}
        {field.restart && <span className="text-[11px] text-muted">restart needed</span>}
      </span>

      {field.choices ? (
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
