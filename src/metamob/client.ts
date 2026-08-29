import { z } from "zod";

const API_BASE_URL = "https://www.metamob.fr/api/";
const localizedNameSchema = z.object({ fr: z.string(), en: z.string().optional(), es: z.string().optional() });
const questSchema = z.object({
  slug: z.string().min(1),
  character_name: z.string().min(1),
  parallel_quests: z.number().int().positive(),
  server: z.object({ id: z.number().int(), name: z.string() }),
  quest_template: z.object({ id: z.number().int(), monster_count: z.number().int(), step_count: z.number().int() }),
});
const questListSchema = z.object({ data: z.array(questSchema) });
const questSettingsSchema = z.object({ data: questSchema.passthrough() });
const zoneMonsterSchema = z.object({
  id: z.number().int().positive(),
  name: localizedNameSchema,
  type: z.object({ id: z.number().int() }),
  owned: z.number().int().nonnegative(),
});
const questZonesSchema = z.object({
  data: z.array(z.object({
    subzones: z.array(z.object({ monsters: z.array(zoneMonsterSchema) })),
  })),
});

class MetaMobHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "MetaMobHttpError";
  }
}

export interface MetaMobQuest {
  slug: string;
  characterName: string;
  parallelQuests: number;
  serverName: string;
  templateMonsterCount: number;
}

export interface MetaMobArchmonster {
  id: number;
  name: string;
  quantity: number;
}

export class MetaMobClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly apiKey: string, fetcher?: typeof fetch) {
    // Cloudflare's native fetch validates its receiver. Keeping it directly on
    // this instance and calling `this.fetcher(...)` changes that receiver to the
    // MetaMobClient and makes workerd throw "Illegal invocation". The wrapper
    // deliberately invokes the runtime fetch through globalThis instead.
    this.fetcher = fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetcher(new URL(path, API_BASE_URL), {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + this.apiKey,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new MetaMobHttpError(response.status, "Clé API MetaMob invalide ou révoquée");
      if (response.status === 404) throw new MetaMobHttpError(response.status, "Quête ou archimonstre MetaMob introuvable");
      if (response.status === 429) throw new MetaMobHttpError(response.status, "Limite de requêtes MetaMob atteinte, réessayez dans un instant");
      throw new MetaMobHttpError(response.status, "MetaMob a répondu avec l’erreur HTTP " + response.status);
    }
    return response.json();
  }

  async validateCredentials(): Promise<void> {
    await this.request("v1/game-versions");
  }

  async listUserQuests(username: string): Promise<MetaMobQuest[]> {
    let response: unknown;
    try {
      response = await this.request("v1/users/" + encodeURIComponent(username) + "/quests");
    } catch (error) {
      if (error instanceof MetaMobHttpError && error.status === 404) return [];
      throw error;
    }
    const parsed = questListSchema.parse(response);
    return parsed.data.map((quest) => ({
      slug: quest.slug,
      characterName: quest.character_name,
      parallelQuests: quest.parallel_quests,
      serverName: quest.server.name,
      templateMonsterCount: quest.quest_template.monster_count,
    }));
  }

  async assertQuestOwnership(slug: string): Promise<MetaMobQuest> {
    const quest = questSettingsSchema.parse(await this.request("v1/quests/" + encodeURIComponent(slug))).data;
    return {
      slug: quest.slug,
      characterName: quest.character_name,
      parallelQuests: quest.parallel_quests,
      serverName: quest.server.name,
      templateMonsterCount: quest.quest_template.monster_count,
    };
  }

  async listArchmonsters(slug: string): Promise<MetaMobArchmonster[]> {
    const parsed = questZonesSchema.parse(await this.request(
      "v1/quests/" + encodeURIComponent(slug) + "/zones?monster_type_id=3",
    ));
    const byId = new Map<number, MetaMobArchmonster>();
    for (const zone of parsed.data) {
      for (const subzone of zone.subzones) {
        for (const monster of subzone.monsters) {
          if (monster.type.id !== 3) continue;
          const existing = byId.get(monster.id);
          if (existing === undefined || monster.owned > existing.quantity) {
            byId.set(monster.id, { id: monster.id, name: monster.name.fr, quantity: monster.owned });
          }
        }
      }
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }

  async setMonsterQuantity(slug: string, monsterId: number, quantity: number): Promise<void> {
    await this.request("v1/quests/" + encodeURIComponent(slug) + "/monsters/" + monsterId, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  }

  async setMonsterQuantities(slug: string, monsters: Array<{ monsterId: number; quantity: number }>): Promise<void> {
    for (let offset = 0; offset < monsters.length; offset += 200) {
      await this.request("v1/quests/" + encodeURIComponent(slug) + "/monsters", {
        method: "PATCH",
        body: JSON.stringify({ monsters: monsters.slice(offset, offset + 200).map((monster) => ({ monster_id: monster.monsterId, quantity: monster.quantity })) }),
      });
    }
  }
}

export function normalizeMetaMobMonsterName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]+/gu, " ").trim();
}
