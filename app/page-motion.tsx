"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * One enter/leave for the page pane. GSAP is imported on the client so it is
 * not in the server bundle and a slow first paint does not wait for it.
 * Only opacity and transform are touched. Leave is power2.in, enter is
 * power2.out. prefers-reduced-motion skips both and leaves the pane visible.
 */

type GsapStatic = typeof import("gsap").gsap;

let gsap: GsapStatic | null = null;

function loadGsap(): Promise<GsapStatic | null> {
  if (gsap) return Promise.resolve(gsap);
  return import("gsap")
    .then((mod) => {
      gsap = mod.gsap;
      return gsap;
    })
    .catch(() => null);
}

if (typeof window !== "undefined") void loadGsap();

const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const screenPath = useRef(pathname);
  const seen = useRef({ path: pathname, node: children });
  const [shownPath, setShownPath] = useState(pathname);

  if (pathname === shownPath) seen.current = { path: pathname, node: children };

  useIsoLayout(() => {
    const node = ref.current;
    let cancelled = false;
    let swapped = false;
    let tween: { kill(): void } | null = null;
    let failsafe = 0;

    const reveal = () => {
      if (!node) return;
      if (gsap) gsap.set(node, { opacity: 1, y: 0, overwrite: "auto", clearProps: "transform" });
      else node.style.opacity = "1";
    };

    const swap = () => {
      if (cancelled || swapped) return;
      swapped = true;
      screenPath.current = pathname;
      setShownPath(pathname);
    };

    const playEnter = () => {
      if (!node || cancelled) return;
      if (!gsap || reducedMotion()) {
        reveal();
        return;
      }
      tween = gsap.fromTo(
        node,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.28,
          ease: "power2.out",
          overwrite: "auto",
          onComplete: () => {
            gsap?.set(node, { clearProps: "transform" });
          },
        },
      );
    };

    if (screenPath.current === pathname) {
      playEnter();
      return () => {
        cancelled = true;
        tween?.kill();
        // A killed enter must not leave the pane at opacity 0.
        if (!swapped) reveal();
      };
    }

    if (!node || !gsap || reducedMotion()) {
      reveal();
      swap();
      return () => {
        cancelled = true;
      };
    }

    const raw = gsap.getProperty(node, "opacity");
    const opacity = typeof raw === "number" ? raw : 1;
    // A second navigation during a leave takes the newest page immediately
    // instead of chaining fades into a blank pane.
    if (opacity < 0.85) {
      swap();
      return () => {
        cancelled = true;
      };
    }

    tween = gsap.to(node, {
      opacity: 0,
      y: -6,
      duration: 0.2,
      ease: "power2.in",
      overwrite: "auto",
      onComplete: swap,
    });
    failsafe = window.setTimeout(swap, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      tween?.kill();
      if (gsap && node) gsap.killTweensOf(node);
    };
  }, [pathname, shownPath]);

  return (
    <div ref={ref} className="min-w-0">
      {pathname === shownPath ? children : seen.current.node}
    </div>
  );
}
