"use client";

import { PageMotion } from "./page-motion";
import { useRegion } from "./use-region";

/**
 * Every page fills the pane. The page itself is the matrix.
 *
 * This is also where the household's locale, timezone and currency are
 * applied, because it is the one client component every page is inside. The
 * key repaints the tree once if those differ from the defaults — see
 * use-region.ts for why that is a key and not a context.
 */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const region = useRegion();
  return (
    <main className="w-full min-w-0 flex-1 p-3 md:overflow-y-auto md:p-4">
      <PageMotion key={region}>{children}</PageMotion>
    </main>
  );
}
