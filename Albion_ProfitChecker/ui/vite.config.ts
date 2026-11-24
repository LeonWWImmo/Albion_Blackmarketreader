import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Premium on `npm run dev`: there is no database or Stripe key locally, so every signed-in player
 * counts as premium (Guild Pro, live market, alerts, billing status) to see and try those parts.
 * BMR_DEV_PREMIUM=0 shows them as a free player sees them.
 */
const DEV_PREMIUM = process.env.BMR_DEV_PREMIUM !== "0";

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
        aodp.sendResult(res, await aodp.handleAodp(endpoint, Object.fromEntries(url.searchParams)), req);
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
            actionsSecret: "dev",
            premium: async () => DEV_PREMIUM,
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
        // Guild Pro: the job that keeps the fights runs on GitHub; locally it runs before the history is read
        if (url.pathname.replace(/^\/+/, "") === "fights-history") {
          await handleGuild("pro-fights", { method: "GET", query: {}, body: null, token: null, authorization: "Bearer dev" }, await guildDeps).catch(() => null);
        }
        const result = await handleGuild(
          url.pathname.replace(/^\/+/, ""),
          { method: req.method, query: Object.fromEntries(url.searchParams), body, token: authorization.replace(/^Bearer\s+/i, "") || null, authorization },
          await guildDeps
        );
        sendResult(res, result, req);
      });

      // premium: no database or Stripe key locally; with DEV_PREMIUM a signed-in player's status says premium
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
        if (DEV_PREMIUM && url.pathname.replace(/^\/+/, "") === "status" && result.status === 200 && result.body && typeof result.body === "object") {
          Object.assign(result.body, { premium: true, status: "active", renewsAt: null, endsAt: null });
        }
        sendResult(res, result, req);
      });

      // live market (premium): production gets its snapshot from the GitHub job. Locally the first
      // visit per region takes one from AODP (prices first, ~15 s, 4 requests at a time; the sales
      // volume follows in the background) and keeps it in node_modules/.cache for 30 minutes, so a
      // restart of the dev server does not ask again.
      const marketStore = import("./api/_lib/marketLive.js").then((m) => m.createMemoryMarketStore());
      const cacheFile = (region: string) => path.join(rootDir, `node_modules/.cache/bmr-market-${region}.json`);
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
        if ((action === "live" || action === "teaser") && market.LIVE_REGIONS.includes(region)) {
          let row = await store.read(region);
          if (!row) {
            const cached = await readFile(cacheFile(region), "utf8").then(JSON.parse).catch(() => null);
            if (cached?.prices) await store.write(region, cached);
            row = await store.read(region);
          }
          const stale = !row?.pricesAt || Date.now() - Date.parse(row.pricesAt) > 30 * 60000;
          if (stale && !marketFetching.has(region)) {
            const extra: string[] = [];
            for (const file of ["raw-materials-cities-eu.json", "food-prices-eu.json", "potion-prices-eu.json", "consumable-ingredient-prices-eu.json"]) {
              const data = JSON.parse(await readFile(path.join(rootDir, "public/data", file), "utf8").catch(() => "{}"));
              for (const item of data.items ?? []) if (item?.itemId) extra.push(String(item.itemId));
            }
            const ids = market.allLiveIds(
              JSON.parse(await readFile(path.join(rootDir, "../Data/ItemList.json"), "utf8")),
              JSON.parse(await readFile(path.join(rootDir, "public/items-categorized-crafting.json"), "utf8")),
              extra
            );
            const save = async () => {
              await mkdir(path.dirname(cacheFile(region)), { recursive: true });
              await writeFile(cacheFile(region), JSON.stringify(await store.read(region)));
            };
            const at = new Date().toISOString();
            const job = market
              .fetchLive(region, ids, "prices", { concurrency: 4 })
              .then((prices) => store.write(region, { prices, pricesAt: at }))
              .then(save)
              .finally(() => marketFetching.delete(region));
            marketFetching.set(region, job);
            // the volume changes slowly: after the prices, without holding up the page
            void job
              .then(() => market.fetchLive(region, ids, "volume", { concurrency: 4 }))
              .then((volume) => store.write(region, { volume, volumeAt: new Date().toISOString() }))
              .then(save)
              .catch((err) => console.warn("dev live market volume", err instanceof Error ? err.message : err));
          }
          if (!row?.prices) await marketFetching.get(region)?.catch((err) => console.warn("dev live market", err instanceof Error ? err.message : err));
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
            premium: async () => DEV_PREMIUM,
            now: () => new Date()
          }
        );
        sendResult(res, result, req);
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
