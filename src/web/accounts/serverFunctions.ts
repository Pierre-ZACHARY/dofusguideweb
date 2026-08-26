import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestProtocol, setCookie } from "@tanstack/start-server-core/request-response";
import { z } from "zod";
import type { AccountRepository } from "../../accounts/accountRepository.js";
import { verifyGoogleCredential } from "../../accounts/googleIdentity.js";
import {
  storedProgressProfileSchema,
  type AccountSession,
} from "../../accounts/types.js";
import {
  createRuntimeAccountRepository,
  googleClientId,
  profileAvatarUrl,
  publishProfileChanged,
} from "./runtime.js";

const SESSION_COOKIE = "dofusguide_session";
const profileNameSchema = z.string().trim().min(1).max(40);
const avatarSchema = z.object({ breedId: z.number().int().positive(), gender: z.enum(["MALE", "FEMALE"]) });

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

const createProfileInput = z.object({ name: profileNameSchema, avatar: avatarSchema });
export const createPlayerProfile = createServerFn({ method: "POST" }).validator(createProfileInput).handler(async ({ data }) => {
  const selectedAvatar = profileAvatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    const profile = await repository.createProfile(userId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar);
    await repository.setActiveProfile(userId, profile.id);
    return (await repository.getAccount(userId))!;
  });
});

const updateProfileInput = z.object({ profileId: z.string().uuid(), name: profileNameSchema, avatar: avatarSchema });
export const updatePlayerProfile = createServerFn({ method: "POST" }).validator(updateProfileInput).handler(async ({ data }) => {
  const selectedAvatar = profileAvatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts(async (repository) => {
    const userId = await requireUserId(repository);
    await repository.updateProfile(userId, data.profileId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar);
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
    return { shareToken: await repository.enableSharing(userId, data.profileId) };
  }),
);

const shareInput = z.object({ shareToken: z.string().min(20).max(100) });
export const getSharedPlayerProfile = createServerFn({ method: "GET" }).validator(shareInput).handler(({ data }) =>
  withAccounts((repository) => repository.getSharedProfile(data.shareToken)),
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

export type AccountStateDto = AccountSession;
