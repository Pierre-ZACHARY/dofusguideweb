import { ExternalLink, Heart, Skull, Swords } from "lucide-react";
import type { WorldTourTrackDto } from "../data/models.js";
import { useProgress } from "../progress/progressStore.js";
import { summarizeWorldTourProgress } from "../../worldTour/progress.js";
import { ExternalImage } from "./ExternalImage.js";

export function WorldTourProgress({
  guideId,
  tracks,
}: Readonly<{ guideId: number; tracks: WorldTourTrackDto[] }>) {
  const { profile } = useProgress();
  if (tracks.length === 0) return null;
  return (
    <section className="space-y-4" aria-labelledby="world-tour-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="world-tour-title" className="flex items-center gap-2 text-xl font-bold"><Skull aria-hidden="true" /> Le tour du monde</h2>
          <p className="text-sm opacity-65">Votre progression dans les deux grandes tournées de donjons</p>
        </div>
        <span className="badge badge-outline">{tracks.reduce((total, track) => total + track.dungeons.length, 0)} donjons</span>
      </div>
      <div className="space-y-4">
        {tracks.map((track) => {
          const summary = summarizeWorldTourProgress(profile, guideId, track);
          return (
            <article className="card border border-base-300 bg-base-100 shadow-sm" key={track.id}>
              <div className="card-body grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)] lg:items-center">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">Parcours</span>
                      <h3 className="text-lg font-bold">{track.name}</h3>
                    </div>
                    <span className="badge badge-primary badge-outline font-bold">{summary.completed}/{summary.total}</span>
                  </div>
                  <progress className="progress progress-primary h-3 w-full" value={summary.completed} max={summary.total} aria-label={track.name + " : " + summary.completed + " donjons sur " + summary.total} />
                  <p className="text-sm opacity-65">{summary.percent} % du parcours accompli</p>
                </div>
                {summary.next ? (
                  <div className="rounded-box bg-base-200 p-3">
                    <div className="flex items-center gap-3">
                      <ExternalImage src={summary.next.bossImageUrl} alt={summary.next.bossName} className="h-20 w-20 shrink-0 object-contain" hideOnError />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Prochain boss</p>
                        <p className="truncate font-bold">{summary.next.bossName}</p>
                        <p className="text-sm opacity-70">{summary.next.dungeonName}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="badge badge-secondary badge-sm"><Swords size={13} aria-hidden="true" /> Niv. {summary.next.bossLevel}</span>
                          <span className="badge badge-error badge-sm"><Heart size={13} aria-hidden="true" /> {summary.next.bossLifePoints.toLocaleString("fr-FR")} PV</span>
                        </div>
                      </div>
                    </div>
                    {summary.next.dofusPourLesNoobsUrl && (
                      <a className="btn btn-primary btn-sm mt-3 w-full gap-2" href={summary.next.dofusPourLesNoobsUrl} target="_blank" rel="noreferrer">
                        Sorts et stratégie <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="alert alert-success"><span>Parcours terminé !</span></div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
