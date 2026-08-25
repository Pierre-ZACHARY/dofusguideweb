import { ExternalLink } from "lucide-react";
import { normalizeName } from "../../normalizer/names.js";
import type { BreedDto } from "../data/models.js";
import { ExternalImage } from "./ExternalImage.js";
import { GamePosition } from "./GamePosition.js";
import type { ClassQuestGroup } from "./classQuestGroups.js";

function breedFor(breeds: BreedDto[], className: string): BreedDto | null {
  const normalized = normalizeName(className);
  return breeds.find((breed) => normalizeName(breed.name) === normalized) ?? null;
}

export function ClassQuestGrid({ groups, breeds }: Readonly<{ groups: ClassQuestGroup[]; breeds: BreedDto[] }>) {
  if (groups.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {groups.map((group) => {
        const breed = breedFor(breeds, group.className);
        return (
          <li key={group.classElementId}>
            <article className="card h-full min-h-48 border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="card-body items-center p-4 text-center">
                {breed?.imageUrl && (
                  <ExternalImage
                    src={breed.imageUrl}
                    alt={"Symbole de la classe " + group.className}
                    className="h-14 w-14 object-contain"
                    hideOnError
                  />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary">{group.className}</p>
                  <h3 className="mt-1 font-semibold leading-snug">{group.questName}</h3>
                </div>
                <div className="mt-auto flex flex-col items-center gap-2">
                  <GamePosition position={group.position} compact />
                  {group.questUrl && (
                    <a className="btn btn-primary btn-xs gap-1" href={group.questUrl} target="_blank" rel="noreferrer">
                      Guide <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
