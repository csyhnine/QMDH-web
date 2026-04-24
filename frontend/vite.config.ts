import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 18080,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:18010",
        changeOrigin: true
      },
      "/media": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:18010",
        changeOrigin: true
      }
    }
  }
});
