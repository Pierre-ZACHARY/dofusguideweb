import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { z } from "zod";
import { QuestAvatar } from "../components/QuestAvatar.js";
import { questKeyToRouteParam } from "../data/questRoute.js";
import { searchQuestsData } from "../data/staticContentClient.js";

const urlSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  guideId: z.coerce.number().int().optional().catch(undefined),
  stepMin: z.coerce.number().int().positive().optional().catch(undefined),
  stepMax: z.coerce.number().int().positive().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  page: z.coerce.number().int().positive().default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(200).default(24).catch(24),
});

export const Route = createFileRoute("/quests/")({
  validateSearch: urlSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchQuestsData({ data: deps }),
  component: QuestsPage,
});

function QuestsPage() {
  const search = Route.useSearch();
  const result = Route.useLoaderData();
  const pageCount = Math.max(1, Math.ceil(result.total / result.limit));

  return <div className="space-y-7">
    <div>
      <div className="breadcrumbs text-sm"><ul><li>Accueil</li><li>Quêtes</li></ul></div>
      <h1 className="text-3xl font-bold">Trouver une quête</h1>
      <p className="mt-2 opacity-70">La recherche normalise accents, numéros et espaces, puis interroge l’index statique généré.</p>
    </div>
    <form className="card border border-base-300 bg-base-100 shadow-sm" method="get">
      <div className="card-body grid gap-4 p-5 md:grid-cols-4">
        <fieldset className="fieldset md:col-span-2">
          <legend className="fieldset-legend">Nom de quête</legend>
          <label className="input w-full"><Search size={17} /><input name="q" defaultValue={search.q ?? ""} placeholder="Bouc à misère" /></label>
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Catégorie</legend>
          <select className="select w-full" name="type" defaultValue={search.type ?? ""}>
            <option value="">Toutes</option><option value="QUEST">QUEST</option><option value="ALI">Alignement</option><option value="TDM">Tour du monde</option>
          </select>
        </fieldset>
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Plage d’étapes</legend>
          <div className="join">
            <input className="input join-item w-1/2" name="stepMin" type="number" min="1" defaultValue={search.stepMin} placeholder="De" aria-label="Étape minimale" />
            <input className="input join-item w-1/2" name="stepMax" type="number" min="1" defaultValue={search.stepMax} placeholder="À" aria-label="Étape maximale" />
          </div>
        </fieldset>
        <div className="card-actions justify-end md:col-span-4"><button className="btn btn-primary gap-2" type="submit"><Search size={17} />Rechercher</button></div>
      </div>
    </form>
    <div className="flex items-center justify-between">
      <p className="font-medium">{result.total} quête{result.total === 1 ? "" : "s"}</p>
      <span className="badge badge-ghost">Page {result.page}/{pageCount}</span>
    </div>
    {result.items.length === 0
      ? <div className="alert alert-info"><span>Aucune quête ne correspond à ces filtres.</span></div>
      : <ul className="list rounded-box border border-base-300 bg-base-100 shadow-sm">
        {result.items.map((quest) => {
          const questRouteParam = questKeyToRouteParam(quest.questKey);
          return <li key={quest.questKey} className="list-row items-center">
            <QuestAvatar src={quest.npcImageUrl} name={quest.npcName ?? quest.originalName ?? quest.questKey} />
            <div className="min-w-0">
              <Link className="link link-hover font-semibold" to="/quests/$questKey" params={{ questKey: questRouteParam }}>{quest.originalName ?? quest.questKey}</Link>
              <div className="flex flex-wrap gap-2 text-xs opacity-65"><span>{quest.npcName ?? "PNJ inconnu"}</span>{quest.startMap && <span>· {quest.startMap}</span>}</div>
            </div>
            {quest.category && <span className="badge badge-outline">{quest.category}</span>}
            <Link className="btn btn-square btn-ghost" to="/quests/$questKey" params={{ questKey: questRouteParam }} aria-label={`Voir ${quest.originalName ?? quest.questKey}`}><ChevronRight /></Link>
          </li>;
        })}
      </ul>}
    <div className="join mx-auto">
      {result.page > 1 && <Link className="btn join-item" to="/quests" search={{ ...search, page: result.page - 1 }}><ChevronLeft size={17} />Précédente</Link>}
      <button className="btn btn-active join-item">{result.page}</button>
      {result.page < pageCount && <Link className="btn join-item" to="/quests" search={{ ...search, page: result.page + 1 }}>Suivante<ChevronRight size={17} /></Link>}
    </div>
  </div>;
}
