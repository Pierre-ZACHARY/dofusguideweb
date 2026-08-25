// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestAvatar } from "../../src/web/components/QuestAvatar.js";

describe("QuestAvatar", () => {
  it("affiche le portrait puis revient à une initiale si le lien est mort", () => {
    render(<QuestAvatar src="https://example.invalid/npc.png" name="Snori Nairb" />);
    const image = screen.getByRole("img", { name: "Portrait de Snori Nairb" });
    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "Portrait de Snori Nairb" })).toBeNull();
    expect(screen.getByText("S")).toBeTruthy();
  });
});
