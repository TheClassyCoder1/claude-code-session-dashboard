"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// The dashboard is server-rendered (force-dynamic). New/finished sessions only
// appear on reload, so poll the server component on an interval. router.refresh()
// re-runs the RSC and reconciles — no full page reload, no websocket.
//
// The refresh is guarded: never start one while the previous is still in flight
// (on slow links — e.g. a phone through an ngrok tunnel — unguarded 3s refreshes
// overlap, abort each other, and keep the page perpetually re-rendering, which
// swallows taps), and skip entirely while the tab is hidden.
export default function AutoRefresh({ intervalMs = 3_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  useEffect(() => {
    const id = setInterval(() => {
      if (refreshing || document.hidden) return;
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, refreshing]);
  return null;
}
