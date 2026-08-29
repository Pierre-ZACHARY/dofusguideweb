import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { webPlugins } from "./vite.shared.js";

const optimizeDepsExclude = [
  "@tanstack/start-server-core",
  "@cloudflare/pages-plugin-vercel-og",
  "@cloudflare/pages-plugin-vercel-og/api",
];

export default defineConfig(({ command }) => ({
  define: { __CLOUDFLARE_WORKER__: "true" },
  environments: {
    ssr: {
      optimizeDeps: {
        exclude: optimizeDepsExclude,
      },
    },
  },
  optimizeDeps: {
    exclude: optimizeDepsExclude,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    ...webPlugins(command),
  ],
}));
