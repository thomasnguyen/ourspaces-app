import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // SomaFM 403s browser requests that include a Referer. Same-origin proxy strips it.
      "/soma-ice": {
        target: "https://ice4.somafm.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/soma-ice/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("referer");
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});
