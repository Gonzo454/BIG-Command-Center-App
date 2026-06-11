const APPFOLIO_CLIENT_ID = (process.env.APPFOLIO_CLIENT_ID || "").trim();
const APPFOLIO_CLIENT_SECRET = (process.env.APPFOLIO_CLIENT_SECRET || "").trim();
const APPFOLIO_DATABASE = (process.env.APPFOLIO_DATABASE || "").trim();

const PV_CLIENT_ID = (process.env.PV_APPFOLIO_CLIENT_ID || "").trim();
const PV_CLIENT_SECRET = (process.env.PV_APPFOLIO_CLIENT_SECRET || "").trim();
const PV_DATABASE = (process.env.PV_APPFOLIO_DATABASE || "").trim();

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function centralNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
}

export function today(): string {
  const d = centralNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function firstOfMonth(): string {
  const d = centralNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function firstOfYear(): string {
  return `${centralNow().getFullYear()}-01-01`;
}

// Retry transient AppFolio failures (rate limits, gateway errors, network blips)
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  backoffMs = 1000
): Promise<Response> {
  let lastErr: Error = new Error("fetch failed");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchReport<T = Record<string, unknown>>(
  reportName: string,
  body: Record<string, unknown> = {},
  bypassCache = false
): Promise<T[]> {
  const cacheKey = `${reportName}:${JSON.stringify(body)}`;

  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T[];
    }
  }

  const credentials = Buffer.from(
    `${APPFOLIO_CLIENT_ID}:${APPFOLIO_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetchWithRetry(
    `https://${APPFOLIO_DATABASE}.appfolio.com/api/v2/reports/${reportName}.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ ...body, paginate_results: false }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API error ${res.status} on ${reportName}: ${text}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data) ? data : (data.results || []);

  cache.set(cacheKey, { data: rows, expires: Date.now() + CACHE_TTL });
  return rows as T[];
}

/**
 * Fetch a report from the Park Vista AppFolio database.
 * Same interface as fetchReport but uses PV_APPFOLIO_* credentials.
 */
export async function fetchPvReport<T = Record<string, unknown>>(
  reportName: string,
  body: Record<string, unknown> = {},
  bypassCache = false
): Promise<T[]> {
  const cacheKey = `pv:${reportName}:${JSON.stringify(body)}`;

  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.data as T[];
    }
  }

  const credentials = Buffer.from(
    `${PV_CLIENT_ID}:${PV_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetchWithRetry(
    `https://${PV_DATABASE}.appfolio.com/api/v2/reports/${reportName}.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ ...body, paginate_results: false }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PV AppFolio API error ${res.status} on ${reportName}: ${text}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data) ? data : (data.results || []);

  cache.set(cacheKey, { data: rows, expires: Date.now() + CACHE_TTL });
  return rows as T[];
}

export function firstOfQuarter(): string {
  const d = centralNow();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
}

export function centralNowExported(): Date {
  return centralNow();
}

export function parseAmount(v: string | number | null | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n =
    typeof v === "string" ? parseFloat(v.replace(/[,$]/g, "")) : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

/**
 * Return a JSON Response with Vercel CDN edge caching headers.
 * s-maxage=300: serve from edge cache for 5min
 * stale-while-revalidate=3600: serve stale for 1hr while refreshing in background,
 * so users get instant responses while fresh data loads behind the scenes
 */
export function cachedJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        status === 200 ? "s-maxage=300, stale-while-revalidate=3600" : "no-store",
    },
  });
}
