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
        const handler = url.pathname.replace(/^\/+/, "");
        if (handler !== "gold" && handler !== "festivities") return next();
        const aodp = await import("./api/_lib/aodp.js");
        const region = url.searchParams.get("region");
        const result = handler === "gold" ? await aodp.getGold(region) : await aodp.getFestivities(region);
        aodp.sendResult(res, result);
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
