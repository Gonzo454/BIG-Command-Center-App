const APPFOLIO_CLIENT_ID = process.env.APPFOLIO_CLIENT_ID!;
const APPFOLIO_CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET!;
const APPFOLIO_DATABASE = process.env.APPFOLIO_DATABASE!;

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
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
