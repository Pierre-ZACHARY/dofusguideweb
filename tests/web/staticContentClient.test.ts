import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { loadCloudflareStaticAssetJson } from "../../src/web/data/staticContentClient.js";

describe("loadCloudflareStaticAssetJson", () => {
  it("exposes the generated client assets to the Worker", async () => {
    const configuration = JSON.parse(await readFile("wrangler.jsonc", "utf8")) as {
      assets?: { binding?: string };
    };

    expect(configuration.assets?.binding).toBe("ASSETS");
  });

  it("loads generated content through the internal Cloudflare assets binding", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ guides: [] }));

    await expect(loadCloudflareStaticAssetJson("/generated/dofusguide/manifest.json", { fetch }))
      .resolves.toEqual({ guides: [] });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toEqual(new URL("https://assets.local/generated/dofusguide/manifest.json"));
  });

  it("reports a missing static asset without falling back to the public origin", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(null, { status: 404 }));

    await expect(loadCloudflareStaticAssetJson("/generated/dofusguide/manifest.json", { fetch }))
      .rejects.toThrow("Unable to load static content /generated/dofusguide/manifest.json: 404");
  });
});
