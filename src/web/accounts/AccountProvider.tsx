import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AccountSession, ProfileAvatar, StoredProgressProfile } from "../../accounts/types.js";
import {
  createPlayerProfile,
  followSharedPlayerProfile,
  getAccountState,
  loginWithGoogle,
  logoutAccount,
  savePlayerProgress,
  selectPlayerProfile,
  sharePlayerProfile,
  unfollowPlayerProfile,
  updatePlayerProfile,
} from "./serverFunctions.js";
import { getProfileAvatars } from "../data/staticContentClient.js";
import { useProfileEvents } from "./profileEventsClient.js";

interface AccountContextValue {
  loading: boolean;
  account: AccountSession | null;
  activeProfile: AccountSession["profiles"][number] | null;
  avatars: ProfileAvatar[];
  error: string | null;
  signIn: (credential: string, localProgress: StoredProgressProfile) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  selectProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string, breedId: number, gender: "MALE" | "FEMALE") => Promise<void>;
  updateProfile: (profileId: string, name: string, breedId: number, gender: "MALE" | "FEMALE") => Promise<void>;
  saveProgress: (profileId: string, progress: StoredProgressProfile) => Promise<void>;
  shareProfile: (profileId: string) => Promise<string>;
  followShare: (shareToken: string) => Promise<void>;
  unfollowProfile: (profileId: string) => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AccountProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [avatars, setAvatars] = useState<ProfileAvatar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const progressSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      setAccount(await getAccountState());
      setError(null);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      refresh(),
      getProfileAvatars().then(setAvatars).catch(() => setAvatars([])),
    ]);
  }, [refresh]);

  useProfileEvents(account?.following.map((profile) => profile.id) ?? [], () => void refresh());

  useEffect(() => {
    if (account === null) return;
    // Presence and network-recovery fallback; profile changes arrive over the
    // Durable Object WebSocket instead of waiting for this timer.
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [account !== null, refresh]);

  const runAccountMutation = useCallback(async (mutation: () => Promise<AccountSession>) => {
    try {
      const next = await mutation();
      setAccount(next);
      setError(null);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      throw mutationError;
    }
  }, []);

  const signIn = useCallback(async (credential: string, localProgress: StoredProgressProfile) => {
    setLoading(true);
    try {
      setAccount(await loginWithGoogle({ data: { credential, localProgress } }));
      setError(null);
    } catch (loginError) {
      setError(errorMessage(loginError));
      throw loginError;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutAccount();
    setAccount(null);
    setError(null);
  }, []);

  const selectProfile = useCallback((profileId: string) =>
    runAccountMutation(() => selectPlayerProfile({ data: { profileId } })), [runAccountMutation]);

  const createProfile = useCallback((name: string, breedId: number, gender: "MALE" | "FEMALE") =>
    runAccountMutation(() => createPlayerProfile({ data: { name, avatar: { breedId, gender } } })), [runAccountMutation]);

  const updateProfile = useCallback((profileId: string, name: string, breedId: number, gender: "MALE" | "FEMALE") =>
    runAccountMutation(() => updatePlayerProfile({ data: { profileId, name, avatar: { breedId, gender } } })), [runAccountMutation]);

  const saveProgress = useCallback((profileId: string, progress: StoredProgressProfile) => {
    const queuedSave = progressSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        await savePlayerProgress({ data: { profileId, progress } });
        setError(null);
      })
      .catch((saveError: unknown) => {
        setError(errorMessage(saveError));
        throw saveError;
      });
    progressSaveQueue.current = queuedSave.catch(() => undefined);
    return queuedSave;
  }, []);

  const shareProfile = useCallback(async (profileId: string) => {
    const result = await sharePlayerProfile({ data: { profileId } });
    await refresh();
    return result.shareToken;
  }, [refresh]);

  const followShare = useCallback((shareToken: string) =>
    runAccountMutation(() => followSharedPlayerProfile({ data: { shareToken } })), [runAccountMutation]);

  const unfollowProfile = useCallback((profileId: string) =>
    runAccountMutation(() => unfollowPlayerProfile({ data: { profileId } })), [runAccountMutation]);

  const activeProfile = account?.profiles.find((profile) => profile.id === account.activeProfileId) ?? null;
  const value = useMemo<AccountContextValue>(() => ({
    loading,
    account,
    activeProfile,
    avatars,
    error,
    signIn,
    signOut,
    refresh,
    selectProfile,
    createProfile,
    updateProfile,
    saveProgress,
    shareProfile,
    followShare,
    unfollowProfile,
  }), [loading, account, activeProfile, avatars, error, signIn, signOut, refresh, selectProfile, createProfile, updateProfile, saveProgress, shareProfile, followShare, unfollowProfile]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (value === null) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}

export function useOptionalAccount(): AccountContextValue | null {
  return useContext(AccountContext);
}
