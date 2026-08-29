import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestProtocol, setCookie } from "@tanstack/start-server-core/request-response";
import { z } from "zod";
import type { AccountRepository } from "../../accounts/accountRepository.js";
import { verifyGoogleCredential } from "../../accounts/googleIdentity.js";
import { findDofusCharacter } from "../../dofus/ladder.js";
import { decryptMetaMobApiKey, encryptMetaMobApiKey } from "../../metamob/credentialCipher.js";
import { MetaMobClient, normalizeMetaMobMonsterName, type MetaMobArchmonster } from "../../metamob/client.js";
import {
  storedProgressProfileSchema,
  type AccountSession,
} from "../../accounts/types.js";
import {
  createRuntimeAccountRepository,
  googleClientId,
  metaMobCredentialsKey,
  profileAvatarUrl,
  publishProfileChanged,
} from "./runtime.js";
import { getProfileAvatars, getSharedProfileGuideIndex } from "../data/staticContentClient.js";
import { buildSharedProfileEmbedData } from "../social/sharedProfileEmbed.js";

const SESSION_COOKIE = "dofusguide_session";
const profileNameSchema = z.string().trim().min(2).max(40);
const avatarSchema = z.object({ breedId: z.number().int().positive(), gender: z.enum(["MALE", "FEMALE"]) });
const dofusProfileSchema = z.object({ name: profileNameSchema, avatar: avatarSchema, serverId: z.number().int().positive() });

function sameDofusName(left: string, right: string): boolean {
  return left.normalize("NFC").trim().localeCompare(right.normalize("NFC").trim(), "fr", { sensitivity: "base" }) === 0;
}

async function verifiedDofusIdentity(name: string, serverId: number) {
  const character = await findDofusCharacter(name, serverId);
  if (character === null) throw new Error("Ce personnage est introuvable sur le serveur DOFUS sélectionné");
  return {
    serverId: character.serverId,
    serverName: character.serverName,
    verifiedAt: new Date().toISOString(),
  };
}

async function withAccounts<T>(callback: (repository: AccountRepository) => Promise<T> | T): Promise<T> {
  const repository = await createRuntimeAccountRepository();
  try {
    return await callback(repository);
  } finally {
    await repository.close();
  }
}

async function currentUserId(repository: AccountRepository): Promise<string | null> {
  const token = getCookie(SESSION_COOKIE);
  return token ? await repository.userIdForSession(token) : null;
}

async function requireUserId(repository: AccountRepository): Promise<string> {
  const userId = await currentUserId(repository);
  if (userId === null) throw new Error("Authentification requise");
  return userId;
}

function setSessionCookie(token: string): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getRequestProtocol() === "https",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export const getGoogleAuthConfig = createServerFn({ method: "GET" }).handler(async () => {
  const clientId = await googleClientId();
  return { enabled: clientId.length > 0, clientId };
});

const loginInput = z.object({
  credential: z.string().min(100),
  localProgress: storedProgressProfileSchema,
});

export const loginWithGoogle = createServerFn({ method: "POST" }).validator(loginInput).handler(async ({ data }) => {
  const clientId = await googleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID n’est pas configuré");
  const identity = await verifyGoogleCredential(data.credential, clientId);
  const defaultAvatarUrl = profileAvatarUrl(9, "MALE");
  return withAccounts(async (repository) => {
    const userId = await repository.upsertGoogleUser(identity, data.localProgress, defaultAvatarUrl);
    const token = await repository.createSession(userId);
    setSessionCookie(token);
    let account = await repository.getAccount(userId);
    if (account === null) throw new Error("Impossible de créer le profil");
    await repository.touchSessionPresence(token, userId, account.activeProfileId);
    account = await repository.getAccount(userId);
    if (account === null) throw new Error("Impossible de créer le profil");
    return account;
  });
});

export const getAccountState = createServerFn({ method: "GET" }).handler(() => withAccounts(async (repository) => {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const userId = await repository.userIdForSession(token);
  if (userId === null) return null;
  let account = await repository.getAccount(userId);
  if (account === null) return null;
  await repository.touchSessionPresence(token, userId, account.activeProfileId);
  account = await repository.getAccount(userId);
  return account;
}));

export const logoutAccount = createServerFn({ method: "POST" }).handler(() => withAccounts(async (repository) => {
  const token = getCookie(SESSION_COOKIE);
  if (token) await repository.deleteSession(token);
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
}));

const createProfileInput = dofusProfileSchema;
export const createPlayerProfile = createServerFn({ method: "POST" }).validator(createProfileInput).handler(async ({ data }) => {
  const selectedAvatar = profileAvatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const identity = await verifiedDofusIdentity(data.name, data.serverId);
    const profile = await repository.createProfile(userId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar, undefined, identity);
    await repository.setActiveProfile(userId, profile.id);
    return (await repository.getAccount(userId))!;
  });
});

const updateProfileInput = dofusProfileSchema.extend({ profileId: z.string().uuid() });
export const updatePlayerProfile = createServerFn({ method: "POST" }).validator(updateProfileInput).handler(async ({ data }) => {
  const selectedAvatar = profileAvatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const account = await repository.getAccount(userId);
    const currentProfile = account?.profiles.find((candidate) => candidate.id === data.profileId);
    if (currentProfile === undefined) throw new Error("Profil introuvable");
    const identity = await verifiedDofusIdentity(data.name, data.serverId);
    await repository.updateProfile(userId, data.profileId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar, identity);
    if (!sameDofusName(currentProfile.name, data.name) || currentProfile.serverId !== identity.serverId) {
      await repository.deleteMetaMobProfileLink(userId, data.profileId);
    }
    await publishProfileChanged(data.profileId);
    return (await repository.getAccount(userId))!;
  });
});

const selectProfileInput = z.object({ profileId: z.string().uuid() });
export const selectPlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.setActiveProfile(userId, data.profileId);
    return (await repository.getAccount(userId))!;
  }),
);

const saveProgressInput = z.object({ profileId: z.string().uuid(), progress: storedProgressProfileSchema });
export const savePlayerProgress = createServerFn({ method: "POST" }).validator(saveProgressInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.saveProgress(userId, data.profileId, data.progress);
    await publishProfileChanged(data.profileId);
    return { savedAt: new Date().toISOString() };
  }),
);

export const sharePlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const account = await repository.getAccount(userId);
    const profile = account?.profiles.find((candidate) => candidate.id === data.profileId);
    if (profile === undefined) throw new Error("Profil introuvable");
    if (profile.serverId === null || profile.dofusVerifiedAt === null) {
      throw new Error("Sélectionnez le serveur et vérifiez le personnage DOFUS avant de partager ce profil");
    }
    return { shareToken: await repository.enableSharing(userId, data.profileId) };
  }),
);

const shareInput = z.object({ shareToken: z.string().min(20).max(100) });
export const getSharedPlayerProfile = createServerFn({ method: "GET" }).validator(shareInput).handler(({ data }) =>
  withAccounts((repository) => repository.getSharedProfile(data.shareToken)),
);

export const getSharedPlayerEmbed = createServerFn({ method: "GET" }).validator(shareInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const profile = await repository.getSharedProfile(data.shareToken);
    if (profile === null) return null;
    const [guides, avatars, character] = await Promise.all([
      getSharedProfileGuideIndex(),
      getProfileAvatars(),
      profile.serverId === null
        ? Promise.resolve(null)
        : findDofusCharacter(profile.name, profile.serverId).catch(() => null),
    ]);
    return buildSharedProfileEmbedData(profile, guides, avatars, character);
  }),
);

export const followSharedPlayerProfile = createServerFn({ method: "POST" }).validator(shareInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.followSharedProfile(userId, data.shareToken);
    return (await repository.getAccount(userId))!;
  }),
);

export const unfollowPlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.unfollowProfile(userId, data.profileId);
    return (await repository.getAccount(userId))!;
  }),
);

export interface MetaMobConfigurationDto {
  configured: boolean;
  lookupName: string | null;
  link: { questSlug: string; characterName: string } | null;
  quests: Array<{ slug: string; characterName: string; parallelQuests: number; serverName: string; templateMonsterCount: number }>;
  archmonsters: MetaMobArchmonster[];
}

async function configuredMetaMob(repository: AccountRepository, userId: string): Promise<MetaMobClient> {
  const credential = await repository.getMetaMobCredential(userId);
  if (credential === null) throw new Error("Configurez d’abord votre compte MetaMob");
  const key = await metaMobCredentialsKey();
  if (!key) throw new Error("METAMOB_CREDENTIALS_KEY n’est pas configurée sur le serveur");
  return new MetaMobClient(await decryptMetaMobApiKey(credential.encryptedApiKey, credential.encryptionIv, key));
}

async function readMetaMobConfiguration(repository: AccountRepository, userId: string, profileId: string): Promise<MetaMobConfigurationDto> {
  const credential = await repository.getMetaMobCredential(userId);
  const account = await repository.getAccount(userId);
  const profile = account?.profiles.find((candidate) => candidate.id === profileId);
  if (profile === undefined) throw new Error("Profil introuvable");
  if (credential === null) return { configured: false, lookupName: profile.name, link: null, quests: [], archmonsters: [] };
  const client = await configuredMetaMob(repository, userId);
  const [quests, link] = await Promise.all([
    client.listUserQuests(profile.name),
    repository.getMetaMobProfileLink(userId, profileId),
  ]);
  const matchingQuests = quests.filter((quest) =>
    quest.characterName.localeCompare(profile.name, "fr", { sensitivity: "base" }) === 0
    && (profile.serverName === null || quest.serverName.localeCompare(profile.serverName, "fr", { sensitivity: "base" }) === 0));
  const archmonsters = link === null ? [] : await client.listArchmonsters(link.questSlug);
  return {
    configured: true,
    lookupName: profile.name,
    link: link === null ? null : { questSlug: link.questSlug, characterName: link.characterName },
    quests: matchingQuests,
    archmonsters,
  };
}

export const getMetaMobConfiguration = createServerFn({ method: "GET" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts(async (repository) => readMetaMobConfiguration(repository, await requireUserId(repository), data.profileId)),
);

const saveMetaMobCredentialsInput = z.object({
  profileId: z.string().uuid(),
  apiKey: z.string().trim().min(20).max(500),
});
export const saveMetaMobCredentials = createServerFn({ method: "POST" }).validator(saveMetaMobCredentialsInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const account = await repository.getAccount(userId);
    const profile = account?.profiles.find((candidate) => candidate.id === data.profileId);
    if (profile === undefined) throw new Error("Profil introuvable");
    if (profile.serverId === null) throw new Error("Sélectionnez d’abord le serveur DOFUS de ce profil");
    const client = new MetaMobClient(data.apiKey);
    await client.validateCredentials();
    await client.listUserQuests(profile.name);
    const key = await metaMobCredentialsKey();
    if (!key) throw new Error("METAMOB_CREDENTIALS_KEY n’est pas configurée sur le serveur");
    const encrypted = await encryptMetaMobApiKey(data.apiKey, key);
    await repository.saveMetaMobCredential(userId, profile.name, encrypted.encryptedApiKey, encrypted.encryptionIv);
    return readMetaMobConfiguration(repository, userId, data.profileId);
  }),
);

function archmonsterIds(progress: AccountSession["profiles"][number]["progress"]): Set<number> {
  const ids = new Set<number>();
  for (const key of Object.keys(progress.bestiaryObjectives ?? {})) {
    try {
      const value = JSON.parse(key) as unknown;
      if (Array.isArray(value) && value[0] === "ARCHMONSTER" && typeof value[2] === "number") ids.add(value[2]);
    } catch { /* Ignore progress keys from future versions. */ }
  }
  return ids;
}

function progressWithMetaMobArchmonsters(
  progress: AccountSession["profiles"][number]["progress"],
  archmonsters: MetaMobArchmonster[],
): AccountSession["profiles"][number]["progress"] {
  const bestiaryObjectives = Object.fromEntries(Object.entries(progress.bestiaryObjectives ?? {}).filter(([key]) => {
    try {
      const value = JSON.parse(key) as unknown;
      return !Array.isArray(value) || value[0] !== "ARCHMONSTER";
    } catch { return true; }
  })) as Record<string, true>;
  for (const monster of archmonsters) {
    if (monster.quantity > 0) bestiaryObjectives[JSON.stringify(["ARCHMONSTER", null, monster.id])] = true;
  }
  return { ...progress, bestiaryObjectives };
}

const linkMetaMobQuestInput = z.object({
  profileId: z.string().uuid(),
  questSlug: z.string().trim().min(1).max(120),
  strategy: z.enum(["IMPORT_METAMOB", "EXPORT_LOCAL"]),
});
export const linkMetaMobQuest = createServerFn({ method: "POST" }).validator(linkMetaMobQuestInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const client = await configuredMetaMob(repository, userId);
    const quest = await client.assertQuestOwnership(data.questSlug);
    const account = await repository.getAccount(userId);
    const profile = account?.profiles.find((candidate) => candidate.id === data.profileId);
    if (profile === undefined) throw new Error("Profil introuvable");
    if (profile.serverName === null
      || !sameDofusName(quest.characterName, profile.name)
      || quest.serverName.localeCompare(profile.serverName, "fr", { sensitivity: "base" }) !== 0) {
      throw new Error("Cette quête MetaMob ne correspond pas au personnage et au serveur DOFUS du profil");
    }
    const remote = await client.listArchmonsters(quest.slug);
    if (data.strategy === "EXPORT_LOCAL") {
      const localIds = archmonsterIds(profile.progress);
      await client.setMonsterQuantities(quest.slug, remote.map((monster) => ({ monsterId: monster.id, quantity: localIds.has(monster.id) ? 1 : 0 })));
    } else {
      await repository.saveProgress(userId, profile.id, progressWithMetaMobArchmonsters(profile.progress, remote));
      await publishProfileChanged(profile.id);
    }
    await repository.saveMetaMobProfileLink(userId, profile.id, quest.slug, quest.characterName);
    return readMetaMobConfiguration(repository, userId, profile.id);
  }),
);

const metaMobToggleInput = z.object({
  profileId: z.string().uuid(),
  monsterId: z.number().int().positive(),
  monsterName: z.string().trim().min(1).max(200),
  completed: z.boolean(),
});
export const setMetaMobArchmonsterCompleted = createServerFn({ method: "POST" }).validator(metaMobToggleInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const link = await repository.getMetaMobProfileLink(userId, data.profileId);
    if (link === null) throw new Error("Ce profil n’est lié à aucune quête MetaMob");
    const client = await configuredMetaMob(repository, userId);
    const monsters = await client.listArchmonsters(link.questSlug);
    const normalizedName = normalizeMetaMobMonsterName(data.monsterName);
    const monster = monsters.find((candidate) => candidate.id === data.monsterId && normalizeMetaMobMonsterName(candidate.name) === normalizedName)
      ?? monsters.find((candidate) => normalizeMetaMobMonsterName(candidate.name) === normalizedName);
    if (monster === undefined) throw new Error("Archimonstre introuvable dans cette quête MetaMob");
    await client.setMonsterQuantity(link.questSlug, monster.id, data.completed ? Math.max(1, monster.quantity) : 0);
    const account = await repository.getAccount(userId);
    const profile = account?.profiles.find((candidate) => candidate.id === data.profileId);
    if (profile === undefined) throw new Error("Profil introuvable");
    const next = progressWithMetaMobArchmonsters(profile.progress, monsters.map((candidate) =>
      candidate.id === monster.id ? { ...candidate, quantity: data.completed ? Math.max(1, candidate.quantity) : 0 } : candidate));
    await repository.saveProgress(userId, profile.id, next);
    await publishProfileChanged(profile.id);
    return { monsterId: monster.id, monsterName: monster.name, quantity: data.completed ? Math.max(1, monster.quantity) : 0 };
  }),
);

export const unlinkMetaMobQuest = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.deleteMetaMobProfileLink(userId, data.profileId);
    return readMetaMobConfiguration(repository, userId, data.profileId);
  }),
);

export type AccountStateDto = AccountSession;
