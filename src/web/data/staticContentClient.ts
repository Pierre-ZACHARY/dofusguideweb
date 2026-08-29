import { createIsomorphicFn } from "@tanstack/react-start";
import { normalizeName } from "../../normalizer/names.js";
import type {
  loadGuideData,
  loadGuidesData,
  loadHomeData,
  loadQuestData,
  loadQuestSearchData,
  loadStepData,
  QuestSearchDataInput,
} from "./contentService.js";
import type { QuestDto } from "./models.js";
import type { ProfileAvatar } from "../../accounts/types.js";
import type { SharedProfileGuideIndexDto } from "./models.js";

type HomeData = ReturnType<typeof loadHomeData>;
type GuidesData = ReturnType<typeof loadGuidesData>;
type GuideData = Awaited<ReturnType<typeof loadGuideData>>;
type StepData = Awaited<ReturnType<typeof loadStepData>>;
type QuestData = ReturnType<typeof loadQuestData>;
type QuestSearchData = ReturnType<typeof loadQuestSearchData>;

interface QuestIndexEntry extends QuestDto {
  occurrences: Array<{ guideId: number; stepNumber: number }>;
}

interface StaticContentManifest {
  home: string;
  guidesIndex: string;
  questSearchIndex: string;
  profileAvatars: string;
  sharedProfileIndex: string;
  guides: Array<{
    id: number;
    asset: string;
    steps: Array<{ stepNumber: number; asset: string }>;
  }>;
  quests: Array<{ questKey: string; asset: string }>;
}

export async function loadCloudflareStaticAssetJson(asset: string, assets: AssetsFetcher): Promise<unknown> {
  const response = await assets.fetch(new URL(asset, "https://assets.local"));
  if (!response.ok) throw new Error(`Unable to load static content ${asset}: ${response.status}`);
  return response.json() as Promise<unknown>;
}

const loadAssetJson = createIsomorphicFn()
  .client(async (asset: string) => {
    const response = await fetch(asset);
    if (!response.ok) throw new Error(`Unable to load static content ${asset}: ${response.status}`);
    return response.json() as Promise<unknown>;
  })
  .server(async (asset: string) => {
    if (__CLOUDFLARE_WORKER__) {
      const { env } = await import("cloudflare:workers");
      return loadCloudflareStaticAssetJson(asset, (env as CloudflareEnv).ASSETS);
    }
    const { getRequestUrl } = await import("@tanstack/start-server-core/request-response");
    const nodePort = process.env.NITRO_PORT ?? process.env.PORT;
    const origin = nodePort === undefined
      ? getRequestUrl().origin
      : `http://127.0.0.1:${nodePort}`;
    const response = await fetch(new URL(asset, origin));
    if (!response.ok) throw new Error(`Unable to load static content ${asset}: ${response.status}`);
    return response.json() as Promise<unknown>;
  });

const jsonCache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(asset: string): Promise<T> {
  let cached = jsonCache.get(asset);
  if (cached === undefined) {
    const created = Promise.resolve(loadAssetJson(asset));
    jsonCache.set(asset, created);
    cached = created;
  }
  return cached as Promise<T>;
}

function manifest(): Promise<StaticContentManifest> {
  return fetchJson("/generated/dofusguide/manifest.json");
}

export async function getHomeData(): Promise<HomeData> {
  return fetchJson((await manifest()).home);
}

export async function getProfileAvatars(): Promise<ProfileAvatar[]> {
  return fetchJson((await manifest()).profileAvatars);
}

export async function getSharedProfileGuideIndex(): Promise<SharedProfileGuideIndexDto[]> {
  return fetchJson<{ guides: SharedProfileGuideIndexDto[] }>((await manifest()).sharedProfileIndex)
    .then((value) => value.guides);
}

export async function getGuidesData(): Promise<GuidesData> {
  return fetchJson((await manifest()).guidesIndex);
}

export async function getGuideData({ data }: { data: { guideId: number } }): Promise<GuideData> {
  const entry = (await manifest()).guides.find((guide) => guide.id === data.guideId);
  return entry === undefined ? null : fetchJson(entry.asset);
}

export async function getStepData(
  { data }: { data: { guideId: number; stepNumber: number } },
): Promise<StepData> {
  const guide = (await manifest()).guides.find((entry) => entry.id === data.guideId);
  const step = guide?.steps.find((entry) => entry.stepNumber === data.stepNumber);
  return step === undefined ? null : fetchJson(step.asset);
}

export async function getQuestData({ data }: { data: { questKey: string } }): Promise<QuestData> {
  const entry = (await manifest()).quests.find((quest) => quest.questKey === data.questKey);
  return entry === undefined ? null : fetchJson(entry.asset);
}

export async function searchQuestsData({ data }: { data: QuestSearchDataInput }): Promise<QuestSearchData> {
  const entries = await fetchJson<QuestIndexEntry[]>((await manifest()).questSearchIndex);
  const q = data.q === undefined ? "" : normalizeName(data.q);
  const type = data.type?.toLocaleLowerCase("fr") ?? "";
  const filtered = entries.filter((quest) => {
    if (q !== "" && !(quest.normalizedName ?? "").includes(q)) return false;
    if (type !== "" && (quest.category ?? "").toLocaleLowerCase("fr") !== type) return false;
    if (data.guideId === undefined && data.stepMin === undefined && data.stepMax === undefined) return true;
    return quest.occurrences.some((occurrence) =>
      (data.guideId === undefined || occurrence.guideId === data.guideId)
      && (data.stepMin === undefined || occurrence.stepNumber >= data.stepMin)
      && (data.stepMax === undefined || occurrence.stepNumber <= data.stepMax));
  });
  const offset = (data.page - 1) * data.limit;
  return {
    items: filtered.slice(offset, offset + data.limit).map(({ occurrences: _occurrences, ...quest }) => quest),
    total: filtered.length,
    limit: data.limit,
    offset,
    page: data.page,
  };
}
