// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileAvatarImage, ProfileEditor } from "../../src/web/accounts/ProfileEditor.js";

describe("ProfileEditor", () => {
  it("affiche une étiquette compacte classe et genre sans texte rogné", () => {
    render(<ProfileEditor
      profile={{ name: "Joueur", breedId: 1, gender: "MALE", serverId: null }}
      avatars={[
        { key: "1:MALE", breedId: 1, breedName: "Féca", gender: "MALE", imageUrl: "/profile-avatars/1-male-full.png" },
        { key: "1:FEMALE", breedId: 1, breedName: "Féca", gender: "FEMALE", imageUrl: "/profile-avatars/1-female-full.png" },
      ]}
      submitLabel="Enregistrer"
      onSave={vi.fn()}
    />);

    expect(screen.getByText("Féca M")).toBeTruthy();
    expect(screen.getByText("Féca F")).toBeTruthy();
    expect(screen.queryByText("Masculin")).toBeNull();
    expect(screen.queryByText("Féminin")).toBeNull();
    expect(screen.getByRole("option", { name: "Dakal" })).toBeTruthy();
  });

  it("indique la présence uniquement avec le cercle autour de l'avatar", () => {
    render(<ProfileAvatarImage src="/profile.png" name="Joueur" online />);

    const image = screen.getByAltText("Personnage Joueur");
    expect(image.parentElement?.className).toContain("ring-success");
    expect(screen.queryByLabelText("En ligne")).toBeNull();
  });
});
