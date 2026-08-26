import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CheckCircle2, MapPinned, RotateCcw } from "lucide-react";
import type { ChapterDto, DofusProgressDto, GuideSummaryDto, StepSummaryDto } from "../data/models.js";
import { getStepProgress, useProgress } from "../progress/progressStore.js";
import { summarizeChapterProgress } from "../progress/chapterProgress.js";
import { ExternalImage } from "./ExternalImage.js";
import { useAccount } from "../accounts/AccountProvider.js";
import { FollowerProgressMarkers } from "../accounts/FollowerMarkers.js";
import { chapterPercentForProfile, followersInChapter } from "../accounts/followedProgress.js";

export function GuideCard({ guide }: Readonly<{ guide: GuideSummaryDto }>) {
  return <article className="card border border-base-300 bg-base-100 shadow-md transition-transform hover:-translate-y-1"><div className="card-body"><div className="flex items-center gap-3"><div className="rounded-box bg-primary/15 p-3 text-primary"><BookOpen aria-hidden="true" /></div><div><h2 className="card-title">{guide.name}</h2><p className="text-sm opacity-65">{guide.author ?? "Guide communautaire"}</p></div></div><div className="stats stats-horizontal bg-base-200 shadow-sm"><div className="stat px-4 py-3"><div className="stat-title">Chapitres</div><div className="stat-value text-2xl">{guide.totalChapters}</div></div><div className="stat px-4 py-3"><div className="stat-title">Étapes</div><div className="stat-value text-2xl">{guide.totalSteps}</div></div></div><div className="card-actions justify-end"><Link className="btn btn-primary gap-2" to="/guides/$guideId" params={{ guideId: String(guide.id) }}>Ouvrir <ArrowRight size={17} aria-hidden="true" /></Link></div></div></article>;
}

export function ChapterCard({ chapter, guideId, steps }: Readonly<{ chapter: ChapterDto; guideId: number; steps: StepSummaryDto[] }>) {
  const { profile, setStepsStatus } = useProgress();
  const { account } = useAccount();
  const summary = summarizeChapterProgress(profile, guideId, chapter, steps);
  const { completed, isCompleted, percent, currentStep } = summary;
  const chapterFollowers = followersInChapter(account?.following ?? [], guideId, chapter, steps);
  const reserveFollowerLane = (account?.following.length ?? 0) > 0;

  const card = <article className={"card relative h-full overflow-hidden border transition " + (isCompleted ? "border-success/50 bg-base-200" : "border-base-300 bg-base-100")}>
    {isCompleted && (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
        <span className="badge badge-success badge-lg -rotate-6 border-2 border-success-content/25 px-5 py-4 text-lg font-black uppercase shadow-lg">✓ Validé</span>
      </div>
    )}
    <div className={"card-body gap-4 p-5 transition-opacity " + (isCompleted ? "opacity-45" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="badge badge-primary badge-outline">Chapitre {chapter.chapterNumber}</span>
          <h3 className="card-title mt-2">{chapter.name}</h3>
        </div>
        {chapter.levelMin !== null && <span className="badge badge-secondary shrink-0 whitespace-nowrap">Niv. {chapter.levelMin}{chapter.levelMax !== chapter.levelMin ? "–" + chapter.levelMax : ""}</span>}
      </div>
      <div className={"relative " + (reserveFollowerLane ? "pt-11" : "")}>
        {reserveFollowerLane && <FollowerProgressMarkers profiles={chapterFollowers} percentFor={(friend) => chapterPercentForProfile(friend, guideId, chapter, steps)} />}
        <progress className={"progress block h-2 w-full " + (isCompleted ? "progress-success" : "progress-primary")} value={percent} max="100" aria-label={"Progression : " + percent + " %"} />
      </div>
      <div className="flex items-center justify-between text-sm opacity-70"><span>{completed}/{summary.total} étapes</span><span>{percent} %</span></div>
      <div className="card-actions mt-auto items-center justify-between gap-2">
        <button
          type="button"
          className={"btn btn-sm gap-2 " + (isCompleted ? "btn-ghost" : "btn-outline btn-success")}
          onClick={() => setStepsStatus(guideId, summary.stepNumbers, isCompleted ? "NOT_STARTED" : "COMPLETED")}
        >
          {isCompleted ? <RotateCcw size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
          {isCompleted ? "Réinitialiser" : "Valider le chapitre"}
        </button>
        <Link className="btn btn-ghost btn-sm gap-2" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(guideId), stepNumber: String(currentStep) }}>
          <MapPinned size={16} aria-hidden="true" />{isCompleted ? "Revoir" : completed > 0 ? "Continuer" : "Commencer"}
        </Link>
      </div>
    </div>
  </article>;

  return card;
}

export function DofusProgressList({ guideId, dofus }: Readonly<{ guideId: number; dofus: DofusProgressDto[] }>) {
  const { profile } = useProgress();
  return <section aria-labelledby="dofus-progress-title">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="dofus-progress-title" className="text-xl font-bold">Progression par Dofus</h2><p className="text-sm opacity-65">Quêtes accomplies dans chaque aventure</p></div>
      <span className="badge badge-outline shrink-0 whitespace-nowrap">{dofus.length} parcours</span>
    </div>
    <div className="overflow-x-auto overflow-y-hidden rounded-box border border-base-300 bg-base-100 p-3">
      <ul className="grid grid-flow-col auto-cols-[8.5rem] gap-3">
        {dofus.map((item) => {
          const completed = item.quests.filter((quest) => getStepProgress(profile, guideId, quest.completionStep) === "COMPLETED").length;
          const percent = item.quests.length === 0 ? 0 : Math.round(completed / item.quests.length * 100);
          return <li key={item.tag} aria-label={item.description || item.name}>
            <article className="card aspect-square border border-base-300 bg-base-200">
              <div className="card-body items-center justify-center gap-2 p-2 text-center">
                <div
                  className="radial-progress text-primary"
                  style={{ "--value": percent, "--size": "5rem", "--thickness": "0.32rem" } as React.CSSProperties}
                  role="progressbar"
                  aria-label={item.name + " : " + percent + " %"}
                  aria-valuenow={percent}
                >
                  <ExternalImage src={item.imageUrl} alt={item.name} className="h-12 w-12 object-contain" hideOnError />
                </div>
                <div className="min-w-0"><p className="text-xs font-bold leading-tight">{item.name}</p><p className="text-xs opacity-65">{completed}/{item.quests.length}</p></div>
              </div>
            </article>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
