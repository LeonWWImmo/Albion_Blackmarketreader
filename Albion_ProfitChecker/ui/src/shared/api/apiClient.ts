export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  dedupeKey?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly causeData: unknown;
  /** Vom Server gefordertes Backoff bei 429/503 (aus Retry-After), in ms. */
  retryAfterMs?: number;

  constructor(message: string, status: number, causeData?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.causeData = causeData;
  }
}

const inFlight = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    timeoutMs = 12000,
    retries = 1,
    retryDelayMs = 250,
    dedupeKey,
    ...requestInit
  } = options;

  const key = dedupeKey || `${requestInit.method || "GET"}:${url}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...requestInit,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            ...(requestInit.headers || {})
          }
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          const apiError = new ApiError(
            `Request failed (${response.status}) for ${url}`,
            response.status,
            body
          );
          // Bei Rate-Limit / Ueberlast (429/503) das vom Server geforderte
          // Backoff respektieren statt sofort erneut zu feuern.
          if (response.status === 429 || response.status === 503) {
            const retryAfter = response.headers.get("retry-after");
            const seconds = retryAfter ? Number(retryAfter) : NaN;
            if (Number.isFinite(seconds) && seconds > 0) {
              apiError.retryAfterMs = Math.min(seconds * 1000, 5000);
            }
          }
          throw apiError;
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (attempt < retries) {
          const backoffMs =
            error instanceof ApiError && error.retryAfterMs
              ? error.retryAfterMs
              : retryDelayMs * (attempt + 1);
          await sleep(backoffMs);
          continue;
        }
      }
    }

    throw lastError;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

