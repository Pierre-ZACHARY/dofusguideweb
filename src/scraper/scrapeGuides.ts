import path from "node:path";
import { DofusGuideClient } from "../api/dofusGuideClient.js";
import type { GuideMetadata, RawJsonDocument } from "../types/dofusGuide.js";
import { atomicWriteFile } from "../utils/fs.js";

export interface GuidesSource {
  getGuidesDocument(): Promise<RawJsonDocument<GuideMetadata[]>>;
}

export interface ScrapeGuidesOptions {
  client?: GuidesSource;
  outputFile?: string;
  logger?: Pick<Console, "info">;
}

export async function scrapeGuides(options: ScrapeGuidesOptions = {}): Promise<GuideMetadata[]> {
  const client = options.client ?? new DofusGuideClient();
  const outputFile = options.outputFile ?? path.resolve("data", "raw", "guides.json");
  const logger = options.logger ?? console;
  const document = await client.getGuidesDocument();

  await atomicWriteFile(outputFile, document.body);

  logger.info(`[guides] saved ${document.data.length} guides`);
  for (const guide of document.data) {
    logger.info(`[guide] ${guide.name}, id=${guide.id}`);
  }
  logger.info(`[guides] output: ${outputFile}`);

  return document.data;
}
