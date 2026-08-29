import type { AccountRepository } from "../../accounts/accountRepository.js";
import type { ProfileGender } from "../../accounts/types.js";

export async function createRuntimeAccountRepository(): Promise<AccountRepository> {
  if (__CLOUDFLARE_WORKER__) {
    const [{ env }, { D1AccountRepository }] = await Promise.all([
      import("cloudflare:workers"),
      import("../../accounts/d1AccountRepository.js"),
    ]);
    return new D1AccountRepository((env as CloudflareEnv).USER_DB);
  }
  const { createAccountRepository } = await import("../../accounts/accountRepository.js");
  return createAccountRepository();
}

export async function googleClientId(): Promise<string> {
  if (__CLOUDFLARE_WORKER__) {
    const { env } = await import("cloudflare:workers");
    return (env as CloudflareEnv).GOOGLE_CLIENT_ID?.trim() ?? "";
  }
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
}

export async function metaMobCredentialsKey(): Promise<string> {
  if (__CLOUDFLARE_WORKER__) {
    const { env } = await import("cloudflare:workers");
    return (env as CloudflareEnv).METAMOB_CREDENTIALS_KEY?.trim() ?? "";
  }
  return process.env.METAMOB_CREDENTIALS_KEY?.trim() ?? "";
}

export function profileAvatarUrl(breedId: number, gender: ProfileGender): string {
  return "/profile-avatars/" + breedId + "-" + (gender === "MALE" ? "male" : "female") + "-full.png";
}

export async function publishProfileChanged(profileId: string): Promise<void> {
  if (!__CLOUDFLARE_WORKER__) return;
  const { env } = await import("cloudflare:workers");
  const namespace = (env as CloudflareEnv).PROFILE_EVENTS;
  await namespace.getByName(profileId).fetch("https://profile-events.internal/publish", {
    method: "POST",
    body: JSON.stringify({ type: "profile-updated", profileId }),
  });
}
