/**
 * Client-side JSON fetch with automatic retry.
 * Large AppFolio pulls occasionally time out and return 5xx even though a
 * subsequent request succeeds, so transient failures are retried with
 * backoff instead of surfacing an error to the user.
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
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < retries) {
      onRetry?.(attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
