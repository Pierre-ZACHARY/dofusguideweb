import { ExternalLink, Luggage, Package, Shield, Sparkles } from "lucide-react";
import type { GuideElementDto } from "../data/models.js";
import { extractChapterMarker, extractRecommendedLevelRange } from "../../shared/guideAnalysis.js";
import { DofusMarkup } from "./DofusMarkup.js";
import { DungeonCard } from "./DungeonCard.js";
import { ExternalImage } from "./ExternalImage.js";
import { asObject, textValue } from "./valueUtils.js";

function TextElement({ element }: Readonly<{ element: GuideElementDto }>) {
  if (typeof element.value !== "string") return null;
  const chapter = extractChapterMarker(element.value);
  const level = extractRecommendedLevelRange(element.value);
  if (chapter) return <h2 className="text-2xl font-bold"><DofusMarkup value={element.value} /></h2>;
  if (level) return <span className="badge badge-secondary badge-lg">Niveau {level.min}{level.max === level.min ? "" : ` → ${level.max}`}</span>;
  const font = asObject(element.font);
  const size = typeof font?.size === "number" ? font.size : 0;
  const bold = font?.bold === "1";
  return size >= 14 || bold
    ? <h3 className="text-lg font-semibold"><DofusMarkup value={element.value} /></h3>
    : <p className="leading-relaxed"><DofusMarkup value={element.value} /></p>;
}

export function ElementRenderer({ element, featuredDungeon = false }: Readonly<{ element: GuideElementDto; featuredDungeon?: boolean }>) {
  if (element.type === "TEXTE" || element.type === "HTML") return <TextElement element={element} />;
  if (element.type === "IMAGE" && typeof element.value === "string") return <ExternalImage src={element.value} alt="Illustration du guide" className="h-36 w-full rounded-box bg-base-200 object-contain sm:h-44" />;
  if (element.type === "DUNGEON") return <DungeonCard element={element} featured={featuredDungeon} />;

  const value = asObject(element.value);
  if (element.type === "ITEMS") return <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-box border border-base-300 bg-base-100 p-2 pr-3 shadow-sm"><ExternalImage src={textValue(value?.image)} alt={textValue(value?.name) ?? "Objet"} className="h-10 w-10 shrink-0 object-contain" /><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="badge badge-accent badge-outline badge-sm gap-1"><Package size={11} aria-hidden="true" />Objet</span><span className="text-sm font-medium">{textValue(value?.name) ?? "Objet inconnu"}</span>{textValue(value?.qte) && <span className="badge badge-ghost badge-sm">x{textValue(value?.qte)}</span>}</div></div>;
  if (element.type === "TRAVEL") return <div className="alert alert-info"><Luggage aria-hidden="true" /><div><p className="font-semibold">{textValue(value?.label) ?? "Déplacement"}</p>{textValue(value?.map) && <p className="text-sm">{textValue(value?.map)}</p>}</div>{textValue(value?.link) && <a className="btn btn-sm" href={textValue(value?.link)!} target="_blank" rel="noreferrer">Ouvrir</a>}</div>;
  if (element.type === "LIEN") return <a className="link link-primary inline-flex items-center gap-2" href={textValue(value?.link) ?? "#"} target="_blank" rel="noreferrer">{textValue(value?.label) ?? "Lien externe"}<ExternalLink size={15} aria-hidden="true" /></a>;
  if (element.type === "CAC" && typeof element.value === "string" && /^cac:\d+$/i.test(element.value.trim())) return null;
  if (element.type === "CAC") return <div className="alert"><Shield aria-hidden="true" /><span>{typeof element.value === "string" ? <DofusMarkup value={element.value} /> : "Conseil de combat"}</span></div>;
  if (element.type === "MONSTER") return <div className="alert alert-warning"><Sparkles aria-hidden="true" /><span>Rencontre : {textValue(value?.name) ?? JSON.stringify(element.value)}</span></div>;
  if (element.type.startsWith("QUEST")) return null;
  return <div className="collapse collapse-arrow border border-warning bg-warning/10"><input type="checkbox" /><div className="collapse-title font-medium">Donnée non interprétée · {element.type}</div><div className="collapse-content"><pre className="overflow-x-auto text-xs">{JSON.stringify(element.raw ?? element.value, null, 2)}</pre></div></div>;
}
