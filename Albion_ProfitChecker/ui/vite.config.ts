import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Block 6 (Hardening): keine Source-Maps in Produktion ausliefern
  // (verhindert, dass der Originalquellcode im Browser einsehbar ist).
  build: {
    sourcemap: false
  },
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src/shared")
    }
  }
});
