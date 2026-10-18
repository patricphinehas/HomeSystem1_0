"use client";

import { useEffect, useState } from "react";

/**
 * Chart colours, taken from the same tokens as the rest of the page.
 *
 * Slot 0 is the accent emerald and slot 1 is the warn amber, in both themes,
 * so a spent line, a price line and an "at or below" mark are the same green
 * the sidebar uses, and a projection or an "above usual" mark is the same
 * amber as a warning tile. The other three slots are quieter companions for
 * the donut — slate, clay, khaki — not a second rainbow.
 *
 * Every named light slot is at least 5:1 against white. The folded "Other"
 * tail is a lighter stone and is named in the legend. The dark column is the
 * same hues lifted for #1f1f23, using the dark accent and warn tokens for the
 * first two slots.
 *
 * Emerald and amber survive deuteranopia better than red against green, and
 * the scatter still encodes that split as shape (circle vs triangle).
 */

export type Palette = typeof LIGHT;

const LIGHT = {
  dark: false,
  series: ["#047857", "#b45309", "#375a7f", "#7a3b4a", "#6a5a3a"],
  other: "#a8a29e",
  good: "#047857",
  critical: "#b45309",
  grid: "#e7e5e4",
  axis: "#d6d3d1",
  ink: "#78716c",
  strong: "#1c1917",
  surface: "#ffffff",
};

const DARK: Palette = {
  dark: true,
  series: ["#34d399", "#fbbf24", "#8eb0d0", "#e098a6", "#b7a07a"],
  other: "#6b6b75",
  good: "#34d399",
  critical: "#fbbf24",
  grid: "#32323a",
  axis: "#3f3f46",
  ink: "#a1a1aa",
  strong: "#f4f4f5",
  surface: "#1f1f23",
};

function chartIsDark() {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Matches `data-theme` the way globals.css does, then the OS. Starts light so the first paint agrees with the server. */
export function usePalette(): Palette {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(chartIsDark());
    sync();
    mq.addEventListener("change", sync);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);

  return dark ? DARK : LIGHT;
}

export const MONTH_LABEL = (month: string) => {
  const [y, m] = month.split("-");
  const name = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short" });
  return m === "01" ? `${name} ${y.slice(2)}` : name;
};
