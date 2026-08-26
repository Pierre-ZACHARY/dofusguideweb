import { nitro } from "nitro/vite";
import path from "node:path";
import { defineConfig } from "vite";
import { prerenderPages, webPlugins } from "./vite.shared.js";

function nodePrerenderPages() {
  return [
    // TanStack Start 1.171.39 marks a failed path as seen before queuing its
    // retry. These unpublished 404 requests let Nitro's preview server finish
    // starting before the public routes are rendered.
    ...Array.from({ length: 4 }, (_, index) => ({
      path: "/__prerender-warmup-" + index,
      prerender: { retryCount: 1, retryDelay: 10_000 },
    })),
    ...prerenderPages(),
  ];
}

export default defineConfig(({ command }) => ({
  define: { __CLOUDFLARE_WORKER__: "false" },
  preview: { host: "127.0.0.1" },
  resolve: {
    alias: { "cloudflare:workers": path.resolve("src/web/cloudflareWorkersNodeStub.ts") },
  },
  optimizeDeps: { exclude: ["@tanstack/start-server-core"] },
  plugins: [
    ...webPlugins(command, nodePrerenderPages()),
    nitro({ commands: { preview: "node ../scripts/prerender-preview.mjs" } }),
  ],
}));
