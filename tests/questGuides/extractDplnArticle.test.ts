import { describe, expect, it } from "vitest";
import { extractDplnArticle } from "../../src/questGuides/extractDplnArticle.js";

describe("extractDplnArticle", () => {
  it("extrait uniquement le contenu éditorial et préserve l’ordre", () => {
    const html = [
      "<!doctype html><html><head><title>Fallback</title></head><body><div id=\"wsite-content\">",
      "<style>.ad { color: red }</style><h2 class=\"wsite-content-title\">Quête test</h2>",
      "<div><strong>Prérequis :</strong><ul><li>Niveau 40</li><li>Une clef</li></ul></div>",
      "<div class=\"paragraph\">Allez voir le PNJ en [1,-2], demandez-lui la clef du repaire puis préparez-vous au combat.</div>",
      "<div><script>steal()</script><span>Rapportez la clef.</span></div>",
      "<div>Commenter</div><div>Quêtes Accueil</div></div></body></html>",
    ].join("");
    const article = extractDplnArticle(html, "https://www.dofuspourlesnoobs.com/test.html");
    expect(article.title).toBe("Quête test");
    expect(article.content).toContain("Prérequis :\n• Niveau 40\n• Une clef");
    expect(article.content).toContain("Allez voir le PNJ en [1,-2]");
    expect(article.content).toContain("Rapportez la clef.");
    expect(article.content).not.toContain("steal");
    expect(article.content).not.toContain("Accueil");
    expect(article.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
