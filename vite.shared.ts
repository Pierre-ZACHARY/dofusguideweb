import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { questKeyToRouteParam } from "./src/web/data/questRoute.js";

interface StaticContentManifest {
  guides: Array<{ id: number; steps: Array<{ stepNumber: number }> }>;
  quests: Array<{ questKey: string }>;
}

function staticContentManifest(): StaticContentManifest {
  const manifestPath = path.resolve("public/generated/dofusguide/manifest.json");
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as StaticContentManifest;
  } catch (error) {
    throw new Error("Static content manifest is missing; run npm run generate-web-content before vite build", { cause: error });
  }
}

export function prerenderPages() {
  const manifest = staticContentManifest();
  return [
    { path: "/" },
    { path: "/quests/" },
    { path: "/progress" },
    ...manifest.guides.flatMap((guide) =>
      guide.steps.map((step) => ({ path: "/guides/" + guide.id + "/steps/" + step.stepNumber })),
    ),
    ...manifest.quests.map((quest) => ({ path: "/quests/" + questKeyToRouteParam(quest.questKey) })),
  ];
}

export function webPlugins(command: string, pages = prerenderPages()) {
  return [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src/web",
      ...(command === "build" ? {
        pages,
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
          // Each rendered route loads generated JSON through the preview
          // server. Buildx runs amd64 and arm64 builds in parallel, so keeping
          // each prerender queue serial avoids starving those nested requests.
          concurrency: 1,
          failOnError: true,
          retryCount: 0,
        },
      } : {}),
    }),
    viteReact(),
  ];
}
