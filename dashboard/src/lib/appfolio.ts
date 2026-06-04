const APPFOLIO_CLIENT_ID = (process.env.APPFOLIO_CLIENT_ID || "").trim();
const APPFOLIO_CLIENT_SECRET = (process.env.APPFOLIO_CLIENT_SECRET || "").trim();
const APPFOLIO_DATABASE = (process.env.APPFOLIO_DATABASE || "").trim();

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

  const res = await fetch(
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

export function parseAmount(v: string | number | null | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n =
    typeof v === "string" ? parseFloat(v.replace(/[,$]/g, "")) : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

/**
 * Return a JSON Response with Vercel CDN edge caching headers.
 * s-maxage=60: serve from edge cache for 60s
 * stale-while-revalidate=300: serve stale for 5min while refreshing in background
 */
export function cachedJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
    },
  });
}
