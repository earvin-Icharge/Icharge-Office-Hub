"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Instant feedback on every tap: a thin lime bar at the top while a page or a Save is on its way.
 * Watches the app's own requests (page loads and server actions), not background prefetches.
 */
export function NavProgress() {
  const [busy, setBusy] = useState(false);
  const inflight = useRef(0);
  const show = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const original = window.fetch;
    const isAppRequest = (init?: RequestInit) => {
      const h = new Headers(init?.headers);
      return (h.has("Next-Action") || h.has("RSC")) && !h.has("Next-Router-Prefetch");
    };
    const start = () => {
      inflight.current++;
      if (!show.current) show.current = setTimeout(() => setBusy(true), 120);
    };
    const end = () => {
      inflight.current = Math.max(0, inflight.current - 1);
      if (inflight.current === 0) {
        if (show.current) clearTimeout(show.current);
        show.current = null;
        setBusy(false);
      }
    };
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isAppRequest(init)) return original(input, init);
      start();
      try {
        return await original(input, init);
      } finally {
        end();
      }
    };
    // Links and forms: show the bar the moment they are tapped.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setBusy(true);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.fetch = original;
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // A new page is showing: done.
  useEffect(() => {
    if (inflight.current === 0) setBusy(false);
  }, [pathname, search]);

  if (!busy) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden bg-charge/30">
      <div className="oh-progress h-full w-1/3 bg-charge" />
    </div>
  );
}
