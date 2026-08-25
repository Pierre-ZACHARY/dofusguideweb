// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStoredProgressProfile, type PlayerProfile } from "../../src/accounts/types.js";

const accountState = vi.hoisted(() => ({
  activeProfile: null as PlayerProfile | null,
  saveProgress: vi.fn(),
}));

vi.mock("../../src/web/accounts/AccountProvider.js", () => ({
  useOptionalAccount: () => ({
    activeProfile: accountState.activeProfile,
    saveProgress: accountState.saveProgress,
  }),
}));

import { getStepProgress, ProgressProvider, useProgress } from "../../src/web/progress/progressStore.js";

function ProgressProbe() {
  const { profile, setStepStatus } = useProgress();
  return (
    <>
      <button type="button" onClick={() => setStepStatus(-1, 8, "COMPLETED")}>Cocher</button>
      <output>{getStepProgress(profile, -1, 8)}</output>
    </>
  );
}

function cloudProfile(revision: number): PlayerProfile {
  return {
    id: "profile-1",
    ownerUserId: "user-1",
    name: "Aventurier",
    breedId: 9,
    gender: "MALE",
    avatarUrl: null,
    progress: emptyStoredProgressProfile(),
    revision,
    shareToken: null,
    isOnline: true,
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("synchronisation de progression cloud", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    accountState.activeProfile = cloudProfile(1);
    accountState.saveProgress.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignore un polling cloud intermédiaire pendant que des changements locaux attendent leur sauvegarde", async () => {
    const view = render(<ProgressProvider><ProgressProbe /></ProgressProvider>);
    await waitFor(() => expect(screen.getByText("NOT_STARTED")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cocher" }));
    expect(screen.getByText("COMPLETED")).toBeTruthy();

    accountState.activeProfile = cloudProfile(2);
    view.rerender(<ProgressProvider><ProgressProbe /></ProgressProvider>);
    expect(screen.getByText("COMPLETED")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });
    expect(accountState.saveProgress).toHaveBeenCalledTimes(1);
    expect(accountState.saveProgress.mock.calls[0]?.[1].steps["-1:8"]).toBe("COMPLETED");
  });
});
