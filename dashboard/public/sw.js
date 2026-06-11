/*
 * Command Center service worker.
 * - /api GETs: stale-while-revalidate from local Cache Storage. Cached data
 *   renders instantly (and works fully offline); a network refresh runs in
 *   the background. Retries are handled by the client-side apiFetch — the
 *   SW only does caching so the two layers don't multiply retries.
 * - Cache-warming requests (x-cache-warm header) always go to the network
 *   so the server-side cache stays warm.
 * - Static assets: cache-first.
 * - Page navigations: network-first with offline fallback to cache.
 */
const STATIC_CACHE = "cc-static-v1";
const API_CACHE = "cc-api-v1";
const PAGE_CACHE = "cc-pages-v1";
const API_FRESH_MS = 5 * 60 * 1000; // serve instantly + background refresh
const API_MAX_AGE_MS = 24 * 60 * 60 * 1000; // hard staleness limit when online

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, API_CACHE, PAGE_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", String(Date.now()));
  const body = await response.blob();
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

function cachedAge(response) {
  const at = Number(response.headers.get("sw-cached-at") || 0);
  return at ? Date.now() - at : Infinity;
}

async function handleApi(event, request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const refresh = async () => {
    const res = await fetch(request.clone());
    if (res.ok) await putWithTimestamp(cache, request, res.clone());
    return res;
  };

  // Warming requests always hit the network so the server cache stays warm,
  // and they refresh the local cache as a side effect.
  if (request.headers.get("x-cache-warm")) {
    try {
      return await refresh();
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  }

  if (cached && cachedAge(cached) < API_MAX_AGE_MS) {
    if (cachedAge(cached) > API_FRESH_MS) {
      // stale-while-revalidate: serve instantly, refresh in background
      event.waitUntil(refresh().catch(() => {}));
    }
    return cached;
  }

  try {
    return await refresh();
  } catch (e) {
    if (cached) return cached; // offline: serve last known data regardless of age
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const root = await cache.match("/");
    if (root) return root;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/plaid/") || url.pathname.startsWith("/api/agent-m")) {
    return; // live banking/AI endpoints are never cached
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApi(event, request));
  } else if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  }
});
