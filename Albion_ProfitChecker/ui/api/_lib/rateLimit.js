// A small per-client request limit for one warm function instance: enough to stop one script from
// turning our proxy into a firehose against Albion's killboard. Not shared between instances.

/** `take(client)` is true while the client has requests left in the current window. */
export function createRateLimiter({ limit, windowMs, maxClients = 5000, now = () => Date.now() }) {
  const windows = new Map();
  return {
    take(client) {
      const time = now();
      const key = client || "unknown";
      let entry = windows.get(key);
      if (!entry || time - entry.start >= windowMs) {
        entry = { start: time, count: 0 };
        windows.delete(key);
        windows.set(key, entry);
        while (windows.size > maxClients) windows.delete(windows.keys().next().value);
      }
      entry.count++;
      return entry.count <= limit;
    }
  };
}

/** The visitor's address as Vercel passes it on. */
export function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || String(req.headers?.["x-real-ip"] ?? "") || req.socket?.remoteAddress || "";
}
