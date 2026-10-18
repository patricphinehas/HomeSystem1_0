"use client";

import { PageMotion } from "./page-motion";

/** Every page fills the pane. The page itself is the matrix. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-w-0 flex-1 p-3 md:overflow-y-auto md:p-4">
      <PageMotion>{children}</PageMotion>
    </main>
  );
}
