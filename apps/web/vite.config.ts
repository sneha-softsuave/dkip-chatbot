import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxies /api to the local api container; prod is served by nginx which
// does the same proxy (see nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
