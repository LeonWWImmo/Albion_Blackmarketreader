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
