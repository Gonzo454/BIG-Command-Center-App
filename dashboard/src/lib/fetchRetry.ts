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

/**
 * Fetches JSON from an API route with full retry protection: apiFetch retries
 * transient failures internally, and any non-ok response or parse failure is
 * retried again here with a wait, so the caller's loading state stays up until
 * valid JSON arrives. Error bodies are never returned as data.
 * Defaults to the same loose typing as `res.json()` for drop-in use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiJson<T = any>(
  url: string,
  init?: RequestInit,
  outerRetries = 2,
  waitMs = 3000
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await apiFetch(url, init);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (
        err.name === "AbortError" ||
        /^API error 4(?!29)/.test(err.message) ||
        attempt >= outerRetries
      )
        throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/**
 * Drop-in replacement for fetch() on GET API calls that retries transient
 * failures (5xx, 429, network errors) with backoff before resolving, so
 * initial page loads survive a cold-start hiccup. Resolves with the last
 * Response on non-retryable or exhausted failures, matching fetch semantics.
 */
export async function apiFetch(
  url: string,
  init?: RequestInit,
  retries = 3,
  backoffMs = 2000
): Promise<Response> {
  let lastErr: Error = new Error("Failed to load");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      if (attempt === retries) return res;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "AbortError") throw err;
      lastErr = err;
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
