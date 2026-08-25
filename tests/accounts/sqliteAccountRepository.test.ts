import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteAccountRepository } from "../../src/accounts/sqliteAccountRepository.js";
import { emptyStoredProgressProfile } from "../../src/accounts/types.js";

const directories: string[] = [];

async function repository(): Promise<SqliteAccountRepository> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dofusguide-account-"));
  directories.push(directory);
  return new SqliteAccountRepository(path.join(directory, "users.sqlite"), path.resolve("drizzle-user"));
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SqliteAccountRepository", () => {
  it("imports the local progress into the first profile and keeps independent profiles", async () => {
    const store = await repository();
    const initial = emptyStoredProgressProfile();
    initial.steps["-1:110"] = "IN_PROGRESS";
    const userId = store.upsertGoogleUser({
      subject: "google-1",
      email: "joueur@example.test",
      displayName: "Joueur",
      pictureUrl: null,
    }, initial, "/avatar-iop.png");

    const account = store.getAccount(userId)!;
    expect(account.profiles).toHaveLength(1);
    expect(account.profiles[0]?.progress.steps["-1:110"]).toBe("IN_PROGRESS");
    expect(account.profiles[0]?.avatarUrl).toBe("/avatar-iop.png");

    const second = store.createProfile(userId, "Deuxième", 1, "FEMALE", "/avatar-feca.png");
    store.setActiveProfile(userId, second.id);
    const nextProgress = emptyStoredProgressProfile();
    nextProgress.steps["-1:1"] = "COMPLETED";
    store.saveProgress(userId, second.id, nextProgress);

    const updated = store.getAccount(userId)!;
    expect(updated.activeProfileId).toBe(second.id);
    expect(updated.profiles.find((profile) => profile.id === second.id)?.progress.steps["-1:1"]).toBe("COMPLETED");
    expect(updated.profiles.find((profile) => profile.id === account.profiles[0]!.id)?.progress.steps["-1:110"]).toBe("IN_PROGRESS");
    store.close();
  });

  it("creates opaque sessions and lets another account follow a shared profile", async () => {
    const store = await repository();
    const firstUser = store.upsertGoogleUser({
      subject: "google-owner",
      email: "owner@example.test",
      displayName: "Propriétaire",
      pictureUrl: "https://example.test/owner.jpg",
    }, emptyStoredProgressProfile(), null);
    const firstAccount = store.getAccount(firstUser)!;
    const token = store.createSession(firstUser);
    expect(store.userIdForSession(token)).toBe(firstUser);
    expect(store.userIdForSession(token + "x")).toBeNull();
    store.touchSessionPresence(token, firstUser, firstAccount.activeProfileId);
    expect(store.getAccount(firstUser)?.profiles[0]?.isOnline).toBe(true);

    const shareToken = store.enableSharing(firstUser, firstAccount.activeProfileId);
    const follower = store.upsertGoogleUser({
      subject: "google-follower",
      email: "friend@example.test",
      displayName: "Ami",
      pictureUrl: null,
    }, emptyStoredProgressProfile(), null);
    store.followSharedProfile(follower, shareToken);

    const followed = store.getAccount(follower)!.following;
    expect(followed).toHaveLength(1);
    expect(followed[0]?.ownerDisplayName).toBe("Propriétaire");
    expect(followed[0]?.ownerPictureUrl).toBe("https://example.test/owner.jpg");
    expect(followed[0]?.isOnline).toBe(true);
    expect(followed[0]?.shareToken).toBe(shareToken);
    store.deleteSession(token);
    expect(store.getAccount(follower)?.following[0]?.isOnline).toBe(false);
    store.close();
  });
});
