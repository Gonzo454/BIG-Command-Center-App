"use client";

import { useRef, useCallback } from "react";
import { fetchJsonRetry } from "@/lib/fetchRetry";

/**
 * Client-side fetch cache by query key.
 * Stores previously fetched data so revisiting the same period is instant.
 * Also exposes a prefetch method for background loading.
 */
export function useCachedFetch<T>() {
  const cache = useRef<Map<string, T>>(new Map());

  const fetchCached = useCallback(
    async (url: string, cacheKey?: string): Promise<T> => {
      const key = cacheKey || url;
      const cached = cache.current.get(key);
      if (cached) return cached;

      const data = await fetchJsonRetry<T>(url);
      cache.current.set(key, data);
      return data;
    },
    []
  );

  const getCached = useCallback((key: string): T | undefined => {
    return cache.current.get(key);
  }, []);

  const prefetch = useCallback(
    (url: string, cacheKey?: string) => {
      const key = cacheKey || url;
      if (cache.current.has(key)) return;
      fetchJsonRetry<T>(url)
        .then((data) => cache.current.set(key, data))
        .catch(() => {});
    },
    []
  );

  return { fetchCached, getCached, prefetch };
}
