import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// `npm run dev` has no Vercel functions, so it answers /api/aodp/* and /api/guild/* with the same
// shared code the functions in api/ use. The guild data lives in memory here (there is no database
// key locally) and sign-ins are checked with the public Supabase key. Production never runs this.
function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/aodp", async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const endpoint = url.pathname.replace(/^\/+/, "");
        const aodp = await import("./api/_lib/aodp.js");
        if (!Object.prototype.hasOwnProperty.call(aodp.AODP_ENDPOINTS, endpoint)) return next();
        aodp.sendResult(res, await aodp.handleAodp(endpoint, Object.fromEntries(url.searchParams)));
      });

      let guildDeps: Promise<Record<string, unknown>> | null = null;
      server.middlewares.use("/api/guild", async (req, res) => {
        guildDeps ??= (async () => {
          const [gameinfo, { createMemoryGuildStore }, { loadValues }, { createClient }, envJs] = await Promise.all([
            import("./api/_lib/gameinfo.js"),
            import("./api/_lib/guildMemoryStore.js"),
            import("./api/_lib/itemValue.js"),
            import("@supabase/supabase-js"),
            readFile(path.join(rootDir, "public/env.js"), "utf8")
          ]);
          const env = (name: string) => envJs.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1] ?? "";
          const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } }).auth;
          return {
            store: createMemoryGuildStore(),
            gameinfo,
            userFromToken: async (token: string) => {
              const { data } = await auth.getUser(token);
              return data?.user?.email_confirmed_at ? { id: data.user.id } : null;
            },
            now: () => new Date(),
            cronSecret: "dev",
            values: loadValues
          };
        })();
        // a failed start (missing public/env.js, a broken import) is tried again on the next request
        guildDeps.catch(() => {
          guildDeps = null;
        });
        const url = new URL(req.url || "/", "http://localhost");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        let body: unknown = null;
        try {
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
        } catch {
          body = null;
        }
        const authorization = req.headers.authorization ?? "";
        const [{ handleGuild }, { sendResult }] = await Promise.all([import("./api/_lib/guildApi.js"), import("./api/_lib/aodp.js")]);
        const result = await handleGuild(
          url.pathname.replace(/^\/+/, ""),
          { method: req.method, query: Object.fromEntries(url.searchParams), body, token: authorization.replace(/^Bearer\s+/i, "") || null, authorization },
          await guildDeps
        );
        sendResult(res, result);
      });

      // premium: nobody has it locally (no database, no Stripe key), the panel shows that state
      server.middlewares.use("/api/billing", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const [{ handleBilling }, { createMemoryBillingStore }, { sendResult }, { createClient }, envJs] = await Promise.all([
          import("./api/_lib/billing.js"),
          import("./api/_lib/billingStore.js"),
          import("./api/_lib/aodp.js"),
          import("@supabase/supabase-js"),
          readFile(path.join(rootDir, "public/env.js"), "utf8")
        ]);
        const env = (name: string) => envJs.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1] ?? "";
        const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } }).auth;
        const result = await handleBilling(
          url.pathname.replace(/^\/+/, ""),
          { method: req.method, rawBody: null, signature: null, token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null },
          {
            store: createMemoryBillingStore(),
            userFromToken: async (token: string) => {
              const { data } = await auth.getUser(token);
              return data?.user?.email_confirmed_at ? { id: data.user.id, email: data.user.email ?? null } : null;
            },
            now: () => new Date(),
            env: {}
          }
        );
        sendResult(res, result);
      });

      // live market (premium): locally every signed-in player counts as premium so the panel can be
      // seen, and the first visit per region takes a real snapshot from AODP (about 30 s, then kept
      // in memory for 30 minutes). Production gets its snapshots from the GitHub job instead.
      const marketStore = import("./api/_lib/marketLive.js").then((m) => m.createMemoryMarketStore());
      const alertStore = import("./api/_lib/priceAlerts.js").then((m) => m.memoryAlertStore());
      const marketFetching = new Map<string, Promise<void>>();
      server.middlewares.use("/api/market", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const [market, { sendResult }, { createClient }, envJs] = await Promise.all([
          import("./api/_lib/marketLive.js"),
          import("./api/_lib/aodp.js"),
          import("@supabase/supabase-js"),
          readFile(path.join(rootDir, "public/env.js"), "utf8")
        ]);
        const action = url.pathname.replace(/^\/+/, "");
        const store = await marketStore;
        const region = url.searchParams.get("region") ?? "";
        if (action === "live" && market.LIVE_REGIONS.includes(region)) {
          const row = await store.read(region);
          const stale = !row?.pricesAt || Date.now() - Date.parse(row.pricesAt) > 30 * 60000;
          if (stale && !marketFetching.has(region)) {
            const ids = market.allLiveIds(
              JSON.parse(await readFile(path.join(rootDir, "../Data/ItemList.json"), "utf8")),
              JSON.parse(await readFile(path.join(rootDir, "public/items-categorized-crafting.json"), "utf8"))
            );
            const at = new Date().toISOString();
            const job = Promise.all([market.fetchLive(region, ids, "prices"), market.fetchLive(region, ids, "volume")])
              .then(([prices, volume]) => store.write(region, { prices, pricesAt: at, volume, volumeAt: at }))
              .finally(() => marketFetching.delete(region));
            marketFetching.set(region, job);
          }
          if (!row?.prices) await marketFetching.get(region)?.catch(() => {});
        }
        const env = (name: string) => envJs.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1] ?? "";
        const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } }).auth;
        // price alerts: also in memory; the real Discord webhook check and greeting run
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        let body: unknown = null;
        try {
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
        } catch {
          body = null;
        }
        const alerts = action.startsWith("alert");
        const handle = alerts ? (await import("./api/_lib/priceAlerts.js")).handleAlerts : market.handleMarket;
        const result = await handle(
          action,
          { method: req.method, query: Object.fromEntries(url.searchParams), token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null, body },
          {
            store: alerts ? await alertStore : store,
            actionsSecret: undefined,
            userFromToken: async (token: string) => {
              const { data } = await auth.getUser(token);
              return data?.user?.email_confirmed_at ? { id: data.user.id } : null;
            },
            premium: async () => true,
            now: () => new Date()
          }
        );
        sendResult(res, result);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src/shared")
    }
  }
});
