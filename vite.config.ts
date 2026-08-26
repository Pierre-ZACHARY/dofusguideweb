import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { webPlugins } from "./vite.shared.js";

export default defineConfig(({ command }) => ({
  define: { __CLOUDFLARE_WORKER__: "true" },
  optimizeDeps: { exclude: ["@tanstack/start-server-core"] },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    ...webPlugins(command),
  ],
}));
