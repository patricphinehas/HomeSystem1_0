"use client";

import { useEffect, useState } from "react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";

/**
 * Which palette the page uses. This is the one setting that is per-browser
 * rather than per-household, so it lives in localStorage and never goes near
 * the server; "system" means follow the OS and is the default.
 *
 * The matching inline script in layout.tsx applies the stored choice before
 * first paint, so there is no flash of the wrong theme on a reload.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "theme";
const ICONS = { system: Desktop, light: Sun, dark: Moon };

const apply = (theme: Theme) => {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
};

export function useTheme() {
  // Always "system" on the server and on the first client render, so the
  // markup matches; the stored value lands in the effect below.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);

  const change = (next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private browsing with storage blocked: the choice holds for this page.
    }
  };

  return { theme, change };
}

export function ThemeToggle() {
  const { theme, change } = useTheme();

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-xl border border-border bg-bg p-1">
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => change(option)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-fg"
            }`}
          >
            <Icon size={15} />
            {option}
          </button>
        );
      })}
    </div>
  );
}
