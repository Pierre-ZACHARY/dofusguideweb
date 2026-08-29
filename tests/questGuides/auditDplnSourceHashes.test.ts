import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditDplnSourceHashes } from "../../src/questGuides/auditDplnSourceHashes.js";
import { extractDplnArticle } from "../../src/questGuides/extractDplnArticle.js";

const temporaryDirectories: string[] = [];
const articleHtml = (title: string, text: string) => `
  <main id="wsite-content">
    <h2 class="wsite-content-title">${title}</h2>
    <div>${text.repeat(8)}</div>
  </main>`;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("auditDplnSourceHashes", () => {
  it("produit un rapport stable et liste les étapes dont la source a changé", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dpln-hashes-"));
    temporaryDirectories.push(directory);
    const inputDirectory = path.join(directory, "summaries");
    const outputPath = path.join(directory, "report.json");
    await mkdir(inputDirectory);
    const currentUrl = "https://www.dofuspourlesnoobs.com/quete-a.html";
    const staleUrl = "https://www.dofuspourlesnoobs.com/quete-b.html";
    const currentHtml = articleHtml("Quête A", "Un contenu suffisamment long et stable pour le tutoriel. ");
    const staleHtml = articleHtml("Quête B", "Le contenu distant a changé depuis la génération. ");
    const currentHash = extractDplnArticle(currentHtml, currentUrl).sourceHash;
    await writeFile(path.join(inputDirectory, "0001.json"), JSON.stringify({
      guideId: -1,
      stepNumber: 1,
      summaries: [{ questKey: "quest:1", sourceUrl: currentUrl, sourceTitle: "Quête A", sourceHash: currentHash }],
    }));
    await writeFile(path.join(inputDirectory, "0002.json"), JSON.stringify({
      guideId: -1,
      stepNumber: 2,
      summaries: [{ questKey: "quest:2", sourceUrl: staleUrl, sourceTitle: "Quête B", sourceHash: "0".repeat(64) }],
    }));
    const requestFetch: typeof fetch = async (input) => {
      const url = String(input);
      return new Response(url === currentUrl ? currentHtml : staleHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const report = await auditDplnSourceHashes({ inputDirectory, outputPath, delayMs: 0, requestFetch });

    expect(report).toMatchObject({ sourceCount: 2, currentSourceCount: 1, staleSourceCount: 1, staleSteps: [2] });
    expect(report.sources.find((source) => source.sourceUrl === staleUrl)).toMatchObject({
      needsRegeneration: true,
      affectedSteps: [2],
    });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report);
  });
});
