// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStoredProgressProfile } from "../../src/accounts/types.js";

const { getGoogleAuthConfig } = vi.hoisted(() => ({
  getGoogleAuthConfig: vi.fn(),
}));

vi.mock("../../src/web/accounts/serverFunctions.js", () => ({
  getGoogleAuthConfig,
}));

import { GoogleOneTap } from "../../src/web/accounts/GoogleOneTap.js";

describe("GoogleOneTap", () => {
  beforeEach(() => {
    getGoogleAuthConfig.mockResolvedValue({ enabled: true, clientId: "client-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "google");
  });

  it("transmet le credential Google au gestionnaire de connexion", async () => {
    let googleCallback: ((response: { credential: string }) => void) | undefined;
    const onCredential = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn();
    Object.defineProperty(window, "google", {
      configurable: true,
      value: {
        accounts: {
          id: {
            initialize: vi.fn((options: { callback: (response: { credential: string }) => void }) => {
              googleCallback = options.callback;
            }),
            prompt: vi.fn(),
            cancel,
            renderButton: vi.fn(),
            disableAutoSelect: vi.fn(),
          },
        },
      },
    });

    const view = render(<GoogleOneTap localProgress={emptyStoredProgressProfile()} onCredential={onCredential} buttonHost={null} />);
    await waitFor(() => expect(googleCallback).toBeTypeOf("function"));
    googleCallback?.({ credential: "credential-value" });
    await waitFor(() => expect(onCredential).toHaveBeenCalledWith("credential-value", emptyStoredProgressProfile()));
    view.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
