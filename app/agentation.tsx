"use client";

import { Agentation } from "agentation";

/**
 * Click-to-annotate toolbar for pointing a coding agent at a specific element.
 * Development only — in a production build this renders nothing.
 */
export function DevAnnotator() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation appName="Home System" />;
}
