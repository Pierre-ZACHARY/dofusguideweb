import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DofusMarkup, parseDofusMarkup } from "../../src/web/components/DofusMarkup.js";

describe("DofusMarkup", () => {
  it("analyse les balises fc imbriquées sans interpréter du HTML arbitraire", () => {
    expect(parseDofusMarkup("Avant <fc=255,192,0>Guide</fc=255,192,0> après")).toEqual([
      { type: "text", value: "Avant " },
      { type: "color", color: "rgb(255, 192, 0)", children: [{ type: "text", value: "Guide" }] },
      { type: "text", value: " après" },
    ]);
    const html = renderToStaticMarkup(<DofusMarkup value={'<fc=1,2,3><script>alert("x")</script></fc=1,2,3>'} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("conserve littéralement une couleur invalide", () => {
    expect(renderToStaticMarkup(<DofusMarkup value="<fc=999,0,0>Texte" />)).toContain("&lt;fc=999,0,0&gt;");
  });
});
