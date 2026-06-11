"use client";

import { useEffect } from "react";

// Heaviest AppFolio-backed endpoints; pinging them keeps the Vercel edge
// cache and serverless in-memory cache warm so page loads hit warm data
// instead of cold multi-second pulls that can time out as 500s.
const WARM_URLS = [
  "/api/command-center",
  "/api/kpi-dashboard",
  "/api/big-management",
  "/api/park-vista",
  "/api/hotel",
  "/api/account-totals",
];

const WARM_INTERVAL_MS = 4 * 60 * 1000; // just under the 5-min server cache TTL

export function CacheWarmer() {
  useEffect(() => {
    let stopped = false;

    const warm = () => {
      if (stopped || document.visibilityState !== "visible") return;
      for (const url of WARM_URLS) {
        // x-cache-warm tells the service worker to bypass its local cache so
        // the request reaches the server and keeps the server cache warm
        fetch(url, {
          priority: "low",
          headers: { "x-cache-warm": "1" },
        } as RequestInit).catch(() => {});
      }
    };

    const initial = setTimeout(warm, 15_000);
    const interval = setInterval(warm, WARM_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  return null;
}
