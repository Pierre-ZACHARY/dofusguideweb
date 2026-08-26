import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Flag, ScrollText } from "lucide-react";
import { getGuideData, getHomeData } from "../data/staticContentClient.js";
import { getStepProgress, useProgress } from "../progress/progressStore.js";

export const Route = createFileRoute("/progress")({
  loader: async () => {
    const home = await getHomeData();
    return home.guide ? getGuideData({ data: { guideId: home.guide.id } }) : null;
  },
  component: ProgressPage,
});

function ProgressPage() {
  const data = Route.useLoaderData();
  const { profile, hydrated } = useProgress();
  if (!data) return <div className="alert alert-warning">Aucun guide importé.</div>;

  const completed = data.steps.filter((step) => getStepProgress(profile, data.guide.id, step.stepNumber) === "COMPLETED").length;
  const active = data.steps.find((step) => getStepProgress(profile, data.guide.id, step.stepNumber) === "IN_PROGRESS");
  const percent = data.steps.length ? Math.round(completed / data.steps.length * 100) : 0;
  const questCompleted = Object.values(profile.quests).filter((status) => status === "COMPLETED").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Ma progression</h1>
        <p className="mt-2 opacity-70">Profil local à ce navigateur · format versionné v2</p>
      </div>
      {!hydrated && <div className="skeleton h-32 w-full" />}
      <section className="stats stats-vertical w-full bg-base-100 shadow md:stats-horizontal">
        <div className="stat">
          <div className="stat-figure text-primary"><Flag /></div>
          <div className="stat-title">Guide accompli</div>
          <div className="stat-value text-primary">{percent}%</div>
          <div className="stat-desc">{completed}/{data.steps.length} étapes</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-success"><CheckCircle2 /></div>
          <div className="stat-title">Quêtes terminées</div>
          <div className="stat-value">{questCompleted}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-warning"><CircleDashed /></div>
          <div className="stat-title">Étape active</div>
          <div className="stat-value text-2xl">{active?.stepNumber ?? "—"}</div>
          {active && <div className="stat-actions"><Link className="btn btn-sm btn-primary" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(data.guide.id), stepNumber: String(active.stepNumber) }}>Continuer</Link></div>}
        </div>
      </section>
      <progress className="progress progress-primary h-4" value={percent} max="100" />
      <section>
        <div className="divider"><ScrollText size={18} />Chapitres</div>
        <ul className="steps steps-vertical w-full lg:steps-horizontal">
          {data.chapters.map((chapter) => {
            const chapterSteps = data.steps.filter((step) => step.chapterId === chapter.id);
            const done = chapterSteps.length > 0 && chapterSteps.every((step) => getStepProgress(profile, data.guide.id, step.stepNumber) === "COMPLETED");
            return (
              <li key={chapter.id} className={"step " + (done ? "step-success" : "")} data-content={done ? "✓" : chapter.chapterNumber}>
                <Link className="link-hover py-2 text-left text-sm lg:max-w-24 lg:text-center" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(data.guide.id), stepNumber: String(chapter.startStep) }}>{chapter.name}</Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
