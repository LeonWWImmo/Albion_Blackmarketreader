// A minimal Stripe REST client (no SDK): form-encoded requests with the secret key.
// The key is a restricted key: checkout sessions + customer portal (write), subscriptions,
// customers, products, prices (read). It cannot refund or touch payouts.

/** Stripe's form encoding: { a: { b: 1 }, list: [x] } -> a[b]=1&list[0]=x */
export function formEncode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") formEncode(Array.isArray(value) ? Object.fromEntries(value.map((v, i) => [i, v])) : value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export function createStripe(secretKey) {
  return async function stripe(method, path, params) {
    const body = method === "GET" ? null : formEncode(params).toString();
    const query = method === "GET" && params ? `?${formEncode(params)}` : "";
    const res = await fetch(`https://api.stripe.com/v1/${path}${query}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Stripe ${method} ${path} -> ${res.status} ${data?.error?.message ?? ""}`);
    return data;
  };
}
