import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChapterCard, DofusProgressList } from "../components/GuideComponents.js";
import { WorldTourProgress } from "../components/WorldTourProgress.js";
import { NotFoundPanel } from "../components/NotFoundPanel.js";
import { getGuideData, getHomeData } from "../data/staticContentClient.js";
import { PresenceStats } from "../presence/PresenceStats.js";

export const Route = createFileRoute("/")({
  loader: async () => {
    const home = await getHomeData();
    if (home.guide === null) throw notFound();
    const guide = await getGuideData({ data: { guideId: home.guide.id } });
    if (guide === null) throw notFound();
    return guide;
  },
  component: GuideHomePage,
  notFoundComponent: () => <NotFoundPanel message="Aucun guide n’est disponible dans la base locale." />,
});

function GuideHomePage() {
  const { guide, chapters, steps, dofus, worldTour } = Route.useLoaderData();
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{guide.name}</h1>
          <p className="mt-1 text-sm text-base-content/70">
            Guide écrit par <a className="link link-primary font-medium" href="https://www.twitch.tv/magem" target="_blank" rel="noreferrer">Magem</a>
          </p>
          <p className="mt-2 opacity-70">{chapters.length} chapitres · {steps.length} étapes</p>
        </div>
        <PresenceStats />
      </div>
      <WorldTourProgress guideId={guide.id} tracks={worldTour} />
      <DofusProgressList guideId={guide.id} dofus={dofus} />
      <section>
        <div className="divider">Chapitres</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {chapters.map((chapter) => <ChapterCard key={chapter.id} chapter={chapter} guideId={guide.id} steps={steps} />)}
        </div>
      </section>
    </div>
  );
}
