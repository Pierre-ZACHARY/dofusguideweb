import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProfileAvatars } from "../../accounts/avatarCatalog.js";
import { SqliteDofusGuideRepository } from "../../repositories/sqliteDofusGuideRepository.js";
import {
  loadGuideData,
  loadGuidesData,
  loadHomeData,
  loadQuestData,
  loadQuestSearchData,
  loadStepData,
} from "./contentService.js";

const SCHEMA_VERSION = 1;

export interface StaticContentManifest {
  schemaVersion: number;
  sourceSha256: string;
  home: string;
  guidesIndex: string;
  questSearchIndex: string;
  profileAvatars: string;
  guides: Array<{
    id: number;
    asset: string;
    steps: Array<{ stepNumber: number; asset: string }>;
  }>;
  quests: Array<{ questKey: string; asset: string }>;
}

export interface GenerateStaticContentOptions {
  databasePath?: string;
  outputDirectory?: string;
}

function assetPath(relativePath: string): string {
  return "/generated/dofusguide/" + relativePath.replaceAll("\\", "/");
}

function questFileName(questKey: string): string {
  return Buffer.from(questKey, "utf8").toString("base64url") + ".json";
}

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(value) + "\n", "utf8");
}

async function publishDirectory(temporaryDirectory: string, outputDirectory: string): Promise<void> {
  await rm(outputDirectory, { recursive: true, force: true });
  try {
    await rename(temporaryDirectory, outputDirectory);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    await mkdir(outputDirectory, { recursive: true });
    await cp(temporaryDirectory, outputDirectory, { recursive: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertDedicatedOutputDirectory(outputDirectory: string): void {
  const parsed = path.parse(outputDirectory);
  if (outputDirectory === parsed.root || path.basename(outputDirectory).toLowerCase() !== "dofusguide") {
    throw new Error("Static content output must target a dedicated directory named 'dofusguide'");
  }
}

export async function generateStaticContent(
  options: GenerateStaticContentOptions = {},
): Promise<StaticContentManifest> {
  const databasePath = path.resolve(options.databasePath ?? "data/dofusguide.sqlite");
  const outputDirectory = path.resolve(options.outputDirectory ?? "public/generated/dofusguide");
  assertDedicatedOutputDirectory(outputDirectory);
  const temporaryDirectory = outputDirectory + ".tmp-" + process.pid;
  const sourceSha256 = createHash("sha256").update(await readFile(databasePath)).digest("hex");
  const repository = new SqliteDofusGuideRepository(databasePath);

  await rm(temporaryDirectory, { recursive: true, force: true });
  await mkdir(temporaryDirectory, { recursive: true });

  try {
    const guideSummaries = loadGuidesData(repository);
    const home = loadHomeData(repository);
    const manifest: StaticContentManifest = {
      schemaVersion: SCHEMA_VERSION,
      sourceSha256,
      home: assetPath("home.json"),
      guidesIndex: assetPath("guides.json"),
      questSearchIndex: assetPath("quests/index.json"),
      profileAvatars: assetPath("profile-avatars.json"),
      guides: [],
      quests: [],
    };

    await writeJson(temporaryDirectory, "home.json", home);
    await writeJson(temporaryDirectory, "guides.json", guideSummaries);
    await writeJson(temporaryDirectory, "profile-avatars.json", await loadProfileAvatars());

    for (const guideSummary of guideSummaries) {
      const guideRelativePath = path.join("guides", String(guideSummary.id), "index.json");
      const guide = await loadGuideData(repository, guideSummary.id);
      if (guide === null) throw new Error("Guide disappeared while generating static content: " + guideSummary.id);
      await writeJson(temporaryDirectory, guideRelativePath, guide);

      const steps: Array<{ stepNumber: number; asset: string }> = [];
      for (const step of guide.steps) {
        const stepRelativePath = path.join("guides", String(guideSummary.id), "steps", String(step.stepNumber) + ".json");
        const detail = await loadStepData(repository, guideSummary.id, step.stepNumber);
        if (detail === null) throw new Error("Guide step disappeared while generating static content: " + guideSummary.id + ":" + step.stepNumber);
        await writeJson(temporaryDirectory, stepRelativePath, detail);
        steps.push({ stepNumber: step.stepNumber, asset: assetPath(stepRelativePath) });
      }

      manifest.guides.push({ id: guideSummary.id, asset: assetPath(guideRelativePath), steps });
    }

    const questCount = repository.searchQuests({ limit: 1 }).total;
    const questSearch = loadQuestSearchData(repository, { page: 1, limit: Math.max(questCount, 1) });
    const questIndex = questSearch.items.map((quest) => ({
      ...quest,
      occurrences: repository.getQuestSteps(quest.questKey) ?? [],
    }));
    await writeJson(temporaryDirectory, "quests/index.json", questIndex);

    for (const quest of questSearch.items) {
      const questRelativePath = path.join("quests", questFileName(quest.questKey));
      const detail = loadQuestData(repository, quest.questKey);
      if (detail === null) throw new Error("Quest disappeared while generating static content: " + quest.questKey);
      await writeJson(temporaryDirectory, questRelativePath, detail);
      manifest.quests.push({ questKey: quest.questKey, asset: assetPath(questRelativePath) });
    }

    await writeJson(temporaryDirectory, "manifest.json", manifest);
    await publishDirectory(temporaryDirectory, outputDirectory);
    return manifest;
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    repository.close();
  }
}
