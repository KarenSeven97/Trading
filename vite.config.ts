import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
  server: { allowedHosts: ["terminal.local"] },
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ["lightweight-charts"] } },
    },
  },
  test: { environment: "node" },
} as any);
