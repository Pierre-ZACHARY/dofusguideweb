import { ExternalLink, Swords, Trophy } from "lucide-react";
import { useState } from "react";
import type { GuideElementDto } from "../data/models.js";
import {
  isDungeonSuccessCompleted,
  useProgress,
  type DungeonSuccessIdentity,
} from "../progress/progressStore.js";
import { ExternalImage } from "./ExternalImage.js";
import { asObject, numberValue, textValue } from "./valueUtils.js";

function successId(value: ReturnType<typeof asObject>, index: number): string {
  return textValue(value?.id) ?? String(numberValue(value?.id) ?? index);
}

export function dungeonSuccessIdentities(
  element: GuideElementDto,
  guideId: number,
  stepNumber: number,
): DungeonSuccessIdentity[] {
  const dungeon = asObject(element.value);
  const dungeonKey = textValue(dungeon?.id) ?? String(element.remoteId);
  const successes = Array.isArray(dungeon?.success) ? dungeon.success.map(asObject).filter((item) => item !== null) : [];
  return successes.map((success, index) => ({
    guideId,
    stepNumber,
    dungeonKey,
    successId: successId(success, index),
  }));
}

interface DungeonCardProps {
  element: GuideElementDto;
  featured?: boolean;
  guideId?: number;
  stepNumber?: number;
}

export function DungeonCard({
  element,
  featured = false,
  guideId,
  stepNumber,
}: Readonly<DungeonCardProps>) {
  const { profile, setDungeonSuccessCompleted } = useProgress();
  const [expandedSuccesses, setExpandedSuccesses] = useState<Set<string>>(() => new Set());
  const dungeon = asObject(element.value);
  const name = textValue(dungeon?.name) ?? "Donjon";
  const successes = Array.isArray(dungeon?.success) ? dungeon.success.map(asObject).filter((item) => item !== null) : [];
  const tracked = guideId !== undefined && stepNumber !== undefined;
  const identities = tracked ? dungeonSuccessIdentities(element, guideId, stepNumber) : [];

  const card = (
    <article className="card min-w-0 w-full max-w-2xl overflow-hidden border border-base-300 bg-base-100 text-base-content shadow-md">
      <figure className="h-32 bg-base-200 p-2 sm:h-44 sm:p-3">
        <ExternalImage
          src={textValue(dungeon?.image)}
          alt={"Illustration du donjon " + name}
          className="h-full w-full object-contain"
          hideOnError
        />
      </figure>
      <div className="card-body min-w-0 gap-2.5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-error gap-1"><Swords size={13} aria-hidden="true" /> Donjon</span>
          {featured && <span className="badge badge-warning">Objectif majeur</span>}
        </div>
        <h3 className="card-title">{name}</h3>
        {successes.length > 0 && (
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy size={17} aria-hidden="true" /> {successes.length} succès
            </p>
            <ul className="grid min-w-0 grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-4">
              {successes.map((success, index) => {
                const id = successId(success, index);
                const identity = identities[index];
                const completed = identity !== undefined && isDungeonSuccessCompleted(profile, identity);
                const resolved = element.resolvedChallenges?.find((challenge) => challenge.successId === id);
                const successName = textValue(success.nom) ?? "Succès " + (index + 1);
                const description = textValue(success.description) ?? resolved?.description ?? "Aucune condition détaillée.";
                const expanded = expandedSuccesses.has(id);
                return (
                  <li className="flex min-w-0 flex-col items-center gap-2" key={id}>
                    <button
                      type="button"
                      className={"btn h-16 w-16 rounded-box border-0 bg-warning p-2 text-warning-content shadow-sm hover:bg-warning/80 sm:h-20 sm:w-20 " + (completed ? "opacity-60" : "")}
                      aria-label={(expanded ? "Masquer" : "Afficher") + " la description du succès " + successName}
                      aria-expanded={expanded}
                      onClick={() => setExpandedSuccesses((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })}
                    >
                      {resolved?.imageUrl
                        ? <ExternalImage src={resolved.imageUrl} alt="" className="h-full w-full object-contain" hideOnError />
                        : <Trophy size={30} aria-hidden="true" />}
                    </button>
                    <div className="flex max-w-full items-center justify-center gap-2 text-center">
                      {tracked && identity && (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-success checkbox-xs sm:checkbox-sm"
                          checked={completed}
                          onChange={(event) => setDungeonSuccessCompleted(identity, event.currentTarget.checked)}
                          aria-label={"Valider le succès " + successName}
                        />
                      )}
                      <span className={"max-w-full truncate text-xs font-semibold leading-tight sm:text-sm " + (completed ? "line-through opacity-60" : "")} title={successName}>{successName}</span>
                    </div>
                    {expanded && <p className="w-full break-words text-center text-xs leading-relaxed text-base-content/75">{description}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {textValue(dungeon?.lien) && (
          <div className="card-actions justify-end">
            <a className="btn btn-primary btn-sm gap-2" href={textValue(dungeon?.lien)!} target="_blank" rel="noreferrer">
              Détails <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </article>
  );
  return featured ? <div className="aura aura-gold featured-dungeon min-w-0 w-full max-w-2xl">{card}</div> : card;
}
