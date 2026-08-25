// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supportsDocumentPictureInPicture, useDocumentOverlay } from "../../src/web/components/DocumentOverlay.js";

function Harness() {
  const overlay = useDocumentOverlay();
  return <div>
    <button type="button" onClick={() => void overlay.open()}>Ouvrir</button>
    {overlay.error && <p>{overlay.error}</p>}
    {overlay.portal(<p>Guide dans l’overlay</p>)}
  </div>;
}

describe("document overlay", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "documentPictureInPicture");
  });

  it("détecte le support de Document Picture-in-Picture", () => {
    expect(supportsDocumentPictureInPicture(null)).toBe(false);
    expect(supportsDocumentPictureInPicture({ requestWindow: () => Promise.resolve(window) })).toBe(true);
  });

  it("affiche une explication quand le navigateur ne prend pas l’overlay en charge", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    expect(screen.getByText(/Chrome ou Edge/)).toBeTruthy();
  });

  it("ouvre une fenêtre 520x760 et y rend le guide React", async () => {
    const pipDocument = document.implementation.createHTMLDocument("Overlay");
    const pipWindow = {
      document: pipDocument,
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as Window;
    const requestWindow = vi.fn().mockResolvedValue(pipWindow);
    Object.defineProperty(window, "documentPictureInPicture", {
      configurable: true,
      value: { window: null, requestWindow },
    });

    const view = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Ouvrir" }));

    await waitFor(() => expect(requestWindow).toHaveBeenCalledWith({ width: 520, height: 760, preferInitialWindowPlacement: false }));
    await waitFor(() => expect(pipDocument.body.textContent).toContain("Guide dans l’overlay"));
    view.unmount();
    expect(pipWindow.close).toHaveBeenCalled();
  });
});
