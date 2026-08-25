import { createHash } from "node:crypto";
import { load } from "cheerio";

export interface ExtractedQuestArticle {
  sourceUrl: string;
  title: string;
  content: string;
  sourceHash: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function isNoise(value: string): boolean {
  return value === ""
    || /^publicit[ée]$/iu.test(value)
    || /^\(adsbygoogle/iu.test(value)
    || /^var slmadshb/iu.test(value);
}

export function extractDplnArticle(html: string, sourceUrl: string): ExtractedQuestArticle {
  const $ = load(html);
  const root = $("#wsite-content").first();
  if (root.length === 0) throw new Error("DofusPourLesNoobs article container #wsite-content was not found");

  const title = cleanText(root.find("h2.wsite-content-title").first().text() || $("title").first().text());
  if (title === "") throw new Error("DofusPourLesNoobs article title was not found");

  const blocks: string[] = [];
  let afterTitle = false;
  root.children().each((_index, node) => {
    const element = $(node);
    if (element.is("h2.wsite-content-title")) {
      afterTitle = true;
      return;
    }
    if (!afterTitle) return;

    const clone = element.clone();
    clone.find("script, style, noscript, iframe, .akcelo-wrapper, ins.adsbygoogle").remove();
    clone.find("br").replaceWith("\n");
    clone.find("li").each((_listIndex, listItem) => {
      $(listItem).prepend("\n• ");
    });
    const text = cleanText(clone.text());
    if (/^commenter$/iu.test(text)) return false;
    if (!isNoise(text)) blocks.push(text);
  });

  const content = cleanText(blocks.join("\n\n"));
  if (content.length < 100) throw new Error("DofusPourLesNoobs article content is unexpectedly short");
  return {
    sourceUrl,
    title,
    content,
    sourceHash: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}
