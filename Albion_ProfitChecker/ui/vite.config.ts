import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// `npm run dev` has no Vercel functions, so it answers /api/aodp/* with the same shared code
// the functions in api/aodp/ use. Production never runs this.
function aodpDevApi(): Plugin {
  return {
    name: "aodp-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/aodp", async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const endpoint = url.pathname.replace(/^\/+/, "");
        const aodp = await import("./api/_lib/aodp.js");
        if (!Object.prototype.hasOwnProperty.call(aodp.AODP_ENDPOINTS, endpoint)) return next();
        aodp.sendResult(res, await aodp.handleAodp(endpoint, Object.fromEntries(url.searchParams)));
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), aodpDevApi()],
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src/shared")
    }
  }
});
