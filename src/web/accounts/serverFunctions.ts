import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestProtocol, setCookie } from "@tanstack/start-server-core";
import { z } from "zod";
import { findProfileAvatar, loadProfileAvatars } from "../../accounts/avatarCatalog.js";
import { verifyGoogleCredential } from "../../accounts/googleIdentity.js";
import { SqliteAccountRepository } from "../../accounts/sqliteAccountRepository.js";
import {
  storedProgressProfileSchema,
  type AccountSession,
  type ProfileGender,
} from "../../accounts/types.js";

const SESSION_COOKIE = "dofusguide_session";
const profileNameSchema = z.string().trim().min(1).max(40);
const avatarSchema = z.object({ breedId: z.number().int().positive(), gender: z.enum(["MALE", "FEMALE"]) });

function withAccounts<T>(callback: (repository: SqliteAccountRepository) => T): T {
  const repository = new SqliteAccountRepository();
  try {
    return callback(repository);
  } finally {
    repository.close();
  }
}

function currentUserId(repository: SqliteAccountRepository): string | null {
  const token = getCookie(SESSION_COOKIE);
  return token ? repository.userIdForSession(token) : null;
}

function requireUserId(repository: SqliteAccountRepository): string {
  const userId = currentUserId(repository);
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

async function avatarUrl(breedId: number, gender: ProfileGender): Promise<string | null> {
  return findProfileAvatar(await loadProfileAvatars(), breedId, gender)?.imageUrl ?? null;
}

export const getGoogleAuthConfig = createServerFn({ method: "GET" }).handler(() => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  return { enabled: clientId.length > 0, clientId };
});

const loginInput = z.object({
  credential: z.string().min(100),
  localProgress: storedProgressProfileSchema,
});

export const loginWithGoogle = createServerFn({ method: "POST" }).validator(loginInput).handler(async ({ data }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID n’est pas configuré");
  const identity = await verifyGoogleCredential(data.credential, clientId);
  const defaultAvatarUrl = await avatarUrl(9, "MALE");
  return withAccounts((repository) => {
    const userId = repository.upsertGoogleUser(identity, data.localProgress, defaultAvatarUrl);
    const token = repository.createSession(userId);
    setSessionCookie(token);
    let account = repository.getAccount(userId);
    if (account === null) throw new Error("Impossible de créer le profil");
    repository.touchSessionPresence(token, userId, account.activeProfileId);
    account = repository.getAccount(userId);
    if (account === null) throw new Error("Impossible de créer le profil");
    return account;
  });
});

export const getAccountState = createServerFn({ method: "GET" }).handler(() => withAccounts((repository) => {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const userId = repository.userIdForSession(token);
  if (userId === null) return null;
  let account = repository.getAccount(userId);
  if (account === null) return null;
  repository.touchSessionPresence(token, userId, account.activeProfileId);
  account = repository.getAccount(userId);
  return account;
}));

export const logoutAccount = createServerFn({ method: "POST" }).handler(() => withAccounts((repository) => {
  const token = getCookie(SESSION_COOKIE);
  if (token) repository.deleteSession(token);
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
}));

const createProfileInput = z.object({ name: profileNameSchema, avatar: avatarSchema });
export const createPlayerProfile = createServerFn({ method: "POST" }).validator(createProfileInput).handler(async ({ data }) => {
  const selectedAvatar = await avatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts((repository) => {
    const userId = requireUserId(repository);
    const profile = repository.createProfile(userId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar);
    repository.setActiveProfile(userId, profile.id);
    return repository.getAccount(userId)!;
  });
});

const updateProfileInput = z.object({ profileId: z.string().uuid(), name: profileNameSchema, avatar: avatarSchema });
export const updatePlayerProfile = createServerFn({ method: "POST" }).validator(updateProfileInput).handler(async ({ data }) => {
  const selectedAvatar = await avatarUrl(data.avatar.breedId, data.avatar.gender);
  return withAccounts((repository) => {
    const userId = requireUserId(repository);
    repository.updateProfile(userId, data.profileId, data.name, data.avatar.breedId, data.avatar.gender, selectedAvatar);
    return repository.getAccount(userId)!;
  });
});

const selectProfileInput = z.object({ profileId: z.string().uuid() });
export const selectPlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts((repository) => {
    const userId = requireUserId(repository);
    repository.setActiveProfile(userId, data.profileId);
    return repository.getAccount(userId)!;
  }),
);

const saveProgressInput = z.object({ profileId: z.string().uuid(), progress: storedProgressProfileSchema });
export const savePlayerProgress = createServerFn({ method: "POST" }).validator(saveProgressInput).handler(({ data }) =>
  withAccounts((repository) => {
    const userId = requireUserId(repository);
    repository.saveProgress(userId, data.profileId, data.progress);
    return { savedAt: new Date().toISOString() };
  }),
);

export const listProfileAvatars = createServerFn({ method: "GET" }).handler(() => loadProfileAvatars());

export const sharePlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts((repository) => {
    const userId = requireUserId(repository);
    return { shareToken: repository.enableSharing(userId, data.profileId) };
  }),
);

const shareInput = z.object({ shareToken: z.string().min(20).max(100) });
export const getSharedPlayerProfile = createServerFn({ method: "GET" }).validator(shareInput).handler(({ data }) =>
  withAccounts((repository) => repository.getSharedProfile(data.shareToken)),
);

export const followSharedPlayerProfile = createServerFn({ method: "POST" }).validator(shareInput).handler(({ data }) =>
  withAccounts((repository) => {
    const userId = requireUserId(repository);
    repository.followSharedProfile(userId, data.shareToken);
    return repository.getAccount(userId)!;
  }),
);

export const unfollowPlayerProfile = createServerFn({ method: "POST" }).validator(selectProfileInput).handler(({ data }) =>
  withAccounts((repository) => {
    const userId = requireUserId(repository);
    repository.unfollowProfile(userId, data.profileId);
    return repository.getAccount(userId)!;
  }),
);

export type AccountStateDto = AccountSession;
