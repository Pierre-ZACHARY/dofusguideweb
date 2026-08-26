import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { extractChapterMarker, extractRecommendedLevelRange } from "../../shared/guideAnalysis.js";
import { ElementRenderer } from "../components/ElementRenderer.js";
import { ExternalImage } from "../components/ExternalImage.js";
import { NotFoundPanel } from "../components/NotFoundPanel.js";
import { QuestChecklist } from "../components/QuestChecklist.js";
import { ClassQuestGrid } from "../components/ClassQuestGrid.js";
import { extractClassQuestGroups } from "../components/classQuestGroups.js";
import { DungeonCard } from "../components/DungeonCard.js";
import { getStepData } from "../data/staticContentClient.js";
import { summarizeChapterProgress } from "../progress/chapterProgress.js";
import { getStepProgress, isObjectiveCompleted, useProgress, type ObjectiveIdentity } from "../progress/progressStore.js";
import { useAccount } from "../accounts/AccountProvider.js";
import { FollowerProgressMarkers } from "../accounts/FollowerMarkers.js";
import { chapterPercentForProfile, currentStepForProfile, followersInChapter } from "../accounts/followedProgress.js";

export const Route = createFileRoute("/guides/$guideId_/steps/$stepNumber")({
  loader: async ({ params }) => {
    const value = await getStepData({ data: { guideId: Number(params.guideId), stepNumber: Number(params.stepNumber) } });
    if (!value) throw notFound();
    return value;
  },
  component: StepPage,
  notFoundComponent: () => <NotFoundPanel message="Cette étape n’existe pas dans le carnet." />,
});

function isHeaderMarker(element: ReturnType<typeof Route.useLoaderData>["elements"][number]): boolean {
  if ((element.type !== "TEXTE" && element.type !== "HTML") || typeof element.value !== "string") return false;
  return extractChapterMarker(element.value) !== null || extractRecommendedLevelRange(element.value) !== null;
}

function StepPage() {
  const step = Route.useLoaderData();
  const { profile, setStepStatus } = useProgress();
  const { account } = useAccount();
  const elements = [...step.elements].sort((a, b) => a.visualOrder - b.visualOrder);
  const dungeons = elements.filter((element) => element.type === "DUNGEON");
  const items = elements.filter((element) => element.type === "ITEMS");
  const headerImage = elements.find((element) => element.type === "IMAGE" && typeof element.value === "string");
  const classQuestGroups = extractClassQuestGroups(elements);
  const instructions = elements.filter((element) =>
    !element.type.startsWith("QUEST")
    && element.type !== "DUNGEON"
    && element.type !== "IMAGE"
    && element.type !== "ITEMS"
    && !classQuestGroups.consumedIds.has(element.id)
    && !isHeaderMarker(element),
  );
  const instructionElements = elements.filter((element) =>
    !element.type.startsWith("QUEST")
    && element.type !== "DUNGEON"
    && element.type !== "IMAGE"
    && !isHeaderMarker(element),
  );

  const questObjectives: ObjectiveIdentity[] = step.quests.map((quest) => ({
    guideId: step.guide.id,
    stepNumber: step.stepNumber,
    questKey: quest.questKey,
    relation: quest.relation,
    sortOrder: quest.sortOrder,
  }));
  const usesManualCompletion = questObjectives.length === 0;
  const manualCompleted = getStepProgress(profile, step.guide.id, step.stepNumber) === "COMPLETED";
  const chapterProgress = step.chapter === null
    ? null
    : summarizeChapterProgress(profile, step.guide.id, step.chapter, step.chapterSteps);
  const chapterFollowers = step.chapter === null
    ? []
    : followersInChapter(account?.following ?? [], step.guide.id, step.chapter, step.chapterSteps);
  const stepFollowers = chapterFollowers.filter((friend) =>
    currentStepForProfile(friend.progress, step.guide.id, step.chapterSteps) === step.stepNumber,
  );
  const checkedCount = usesManualCompletion
    ? Number(manualCompleted)
    : questObjectives.filter((objective) => isObjectiveCompleted(profile, objective)).length;
  const objectiveCount = usesManualCompletion ? 1 : questObjectives.length;
  const firstOrder = (matchingElements: typeof elements): number => matchingElements[0]?.visualOrder ?? Number.MAX_SAFE_INTEGER;
  const contentSections = [
    ...((instructions.length > 0 || items.length > 0 || classQuestGroups.groups.length > 0)
      ? [{ kind: "instructions" as const, order: firstOrder(instructionElements) }]
      : []),
    ...(step.quests.length > 0
      ? [{ kind: "quests" as const, order: firstOrder(elements.filter((element) => element.type.startsWith("QUEST"))) }]
      : []),
    ...(dungeons.length > 0
      ? [{ kind: "dungeons" as const, order: firstOrder(dungeons) }]
      : []),
  ].sort((left, right) => left.order - right.order);

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="breadcrumbs text-sm">
        <ul>
          <li><Link to="/">{step.guide.name}</Link></li>
          {step.chapter && <li>{step.chapter.name}</li>}
          <li>Étape {step.stepNumber}</li>
        </ul>
      </div>

      <header className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="min-w-0 flex-1">
              {step.chapter && <p className="text-sm font-medium text-primary">Chapitre {step.chapter.chapterNumber} · {step.chapter.name}</p>}
              <h1 className="text-2xl font-bold sm:text-3xl">{step.title ?? "Étape " + step.stepNumber}</h1>
              <p className="mt-1 text-sm opacity-65">Étape {step.stepNumber} · {step.totalSteps} étapes documentées</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {step.levelMin !== null && (
                  <span className="badge badge-secondary whitespace-nowrap">
                    Niveau {step.levelMin}{step.levelMax !== step.levelMin ? " → " + step.levelMax : ""}
                  </span>
                )}
                <span className={"badge " + (checkedCount === objectiveCount ? "badge-success" : "badge-outline")}>
                  {checkedCount}/{objectiveCount} {usesManualCompletion ? "objectif coché" : objectiveCount > 1 ? "quêtes cochées" : "quête cochée"}
                </span>
              </div>
            </div>
            {headerImage && typeof headerImage.value === "string" && (
              <figure className="h-20 w-20 shrink-0 sm:h-28 sm:w-28">
                <ExternalImage
                  src={headerImage.value}
                  alt={"Illustration de " + (step.title ?? "l’étape " + step.stepNumber)}
                  className="h-full w-full rounded-box object-contain"
                />
              </figure>
            )}
          </div>
          {chapterProgress && (
            <div className="space-y-2 rounded-box bg-base-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">Progression du chapitre</span>
                <span className="tabular-nums opacity-75">
                  {chapterProgress.completed}/{chapterProgress.total} étapes · {chapterProgress.percent} %
                </span>
              </div>
              <div className={"relative " + (chapterFollowers.length > 0 ? "pt-11" : "")}>
                {step.chapter && chapterFollowers.length > 0 && (
                  <FollowerProgressMarkers
                    profiles={chapterFollowers}
                    percentFor={(friend) => chapterPercentForProfile(friend, step.guide.id, step.chapter!, step.chapterSteps)}
                  />
                )}
                <progress
                  className={"progress block h-2 w-full " + (chapterProgress.isCompleted ? "progress-success" : "progress-primary")}
                  value={chapterProgress.percent}
                  max="100"
                  aria-label={"Progression du chapitre : " + chapterProgress.completed + " étapes sur " + chapterProgress.total}
                />
              </div>
            </div>
          )}
          {usesManualCompletion && (
            <label className="flex cursor-pointer items-center gap-3 rounded-box bg-base-200 px-4 py-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={manualCompleted}
                onChange={(event) => setStepStatus(step.guide.id, step.stepNumber, event.currentTarget.checked ? "COMPLETED" : "NOT_STARTED")}
              />
              <span className={manualCompleted ? "line-through opacity-60" : ""}>Terminer cette étape</span>
            </label>
          )}
        </div>
      </header>

      {contentSections.map((section) => {
        if (section.kind === "instructions") return (
          <section className="space-y-4" key={section.kind}>
            <div className="divider">Instructions</div>
            {instructions.map((element) => <ElementRenderer key={element.id} element={element} />)}
            <ClassQuestGrid groups={classQuestGroups.groups} breeds={step.breeds} />
            {items.length > 0 && (
              <div className="flex flex-wrap items-start gap-3">
                {items.map((element) => <ElementRenderer key={element.id} element={element} />)}
              </div>
            )}
          </section>
        );
        if (section.kind === "quests") return (
          <section key={section.kind}>
            <div className="divider">Quêtes</div>
            <QuestChecklist guideId={step.guide.id} stepNumber={step.stepNumber} quests={step.quests} totalObjectives={objectiveCount} followers={stepFollowers} />
          </section>
        );
        return (
          <section key={section.kind}>
            <div className="divider">Donjons</div>
            <div className="flex flex-wrap justify-center gap-5">
              {dungeons.map((element, index) => (
                <DungeonCard
                  key={element.id}
                  element={element}
                  featured={index === 0}
                  guideId={step.guide.id}
                  stepNumber={step.stepNumber}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="join flex w-full justify-between pt-5">
        {step.previousStep
          ? <Link className="btn join-item gap-2" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(step.guide.id), stepNumber: String(step.previousStep) }}><ArrowLeft size={17} />Précédente</Link>
          : <span />}
        {step.nextStep
          ? <Link className="btn btn-primary join-item gap-2" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(step.guide.id), stepNumber: String(step.nextStep) }}>Suivante<ArrowRight size={17} /></Link>
          : <span />}
      </div>
    </div>
  );
}
