// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientPortal } from "../../src/web/components/ClientPortal.js";

describe("ClientPortal", () => {
  it("sort les modals de leur conteneur d’origine", async () => {
    const host = document.createElement("header");
    document.body.append(host);

    render(<ClientPortal><div role="dialog">Contenu du modal</div></ClientPortal>, { container: host });

    await waitFor(() => expect(screen.getByRole("dialog").parentElement).toBe(document.body));
    host.remove();
  });
});
