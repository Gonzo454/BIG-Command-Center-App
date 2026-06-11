/**
 * Client-side JSON fetch with automatic retry.
 * Large AppFolio pulls occasionally time out and return 5xx even though a
 * subsequent request succeeds, so transient failures (5xx, 429, network
 * errors) are retried with backoff. Deterministic 4xx errors are not retried.
 */
export async function fetchJsonRetry<T = unknown>(
  url: string,
  retries = 3,
  backoffMs = 2000,
  onRetry?: (attempt: number) => void
): Promise<T> {
  let lastErr: Error = new Error("Failed to load");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as T;
      const err = new Error(`API error ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw err;
      lastErr = err;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (/^API error 4(?!29)/.test(err.message)) throw err;
      lastErr = err;
    }
    if (attempt < retries) {
      onRetry?.(attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
