"use client";

import { useEffect, useState } from "react";

/**
 * Chart colours.
 *
 * The series slots come from the data-viz reference palette and were validated
 * against *this app's* surfaces (#ffffff light, #1f1f23 dark) with the
 * validator in the dataviz skill, on the adjacent pairlist that a pie ring and
 * a multi-line chart use:
 *
 *   light  worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6 — pass
 *   dark   worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3 — pass
 *
 * Three light-mode slots sit under 3:1 against white, so the pie ships visible
 * labels and a table view rather than relying on the fill alone. The dark
 * column is the same hues re-stepped for the dark surface, not a flip.
 *
 * `good`/`critical` are status colours, kept out of the series order. Red and
 * green are indistinguishable under deuteranopia (ΔE 4.1), so the scatter also
 * encodes the same split as shape (circle vs triangle) and labels it.
 */

export type Palette = typeof LIGHT;

const LIGHT = {
  dark: false,
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  other: "#a8a29e",
  good: "#0ca30c",
  critical: "#d03b3b",
  grid: "#e7e5e4",
  axis: "#c3c2b7",
  ink: "#78716c",
  strong: "#1c1917",
  surface: "#ffffff",
};

const DARK: Palette = {
  dark: true,
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
  other: "#6b6b75",
  good: "#0ca30c",
  critical: "#d03b3b",
  grid: "#32323a",
  axis: "#383835",
  ink: "#a1a1aa",
  strong: "#f4f4f5",
  surface: "#1f1f23",
};

/** Follows the OS theme, like the rest of the app. Starts light for hydration. */
export function usePalette(): Palette {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return dark ? DARK : LIGHT;
}

export const MONTH_LABEL = (month: string) => {
  const [y, m] = month.split("-");
  const name = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short" });
  return m === "01" ? `${name} ${y.slice(2)}` : name;
};
