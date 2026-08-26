import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  define: { __CLOUDFLARE_WORKER__: "false" },
  resolve: {
    alias: { "cloudflare:workers": path.resolve("src/web/cloudflareWorkersNodeStub.ts") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
