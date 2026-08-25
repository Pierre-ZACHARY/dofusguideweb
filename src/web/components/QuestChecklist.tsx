import { ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GuideRelation, StepQuestDto } from "../data/models.js";
import { isObjectiveCompleted, useProgress, type ObjectiveIdentity } from "../progress/progressStore.js";
import { ExternalImage } from "./ExternalImage.js";
import { GamePosition } from "./GamePosition.js";
import { QuestGuideFacts, QuestGuideSummary } from "./QuestGuideSummary.js";
import { asObject, textValue } from "./valueUtils.js";
import type { FollowedProfile } from "../../accounts/types.js";
import { FollowerAvatarStack } from "../accounts/FollowerMarkers.js";

const relationLabels: Record<GuideRelation, string> = {
  START: "À lancer",
  ACTIVE: "À accomplir",
  FINISH: "À rendre",
  UNKNOWN: "Objectif",
};

const relationClasses: Record<GuideRelation, string> = {
  START: "badge-info",
  ACTIVE: "badge-warning",
  FINISH: "badge-success",
  UNKNOWN: "badge-neutral",
};

function identityFor(guideId: number, stepNumber: number, quest: StepQuestDto): ObjectiveIdentity {
  return { guideId, stepNumber, questKey: quest.questKey, relation: quest.relation, sortOrder: quest.sortOrder };
}

function identityKey(identity: ObjectiveIdentity): string {
  return JSON.stringify(identity);
}

function QuestInformationPanel({ quest }: Readonly<{ quest: StepQuestDto }>) {
  const [open, setOpen] = useState(false);
  const value = asObject(quest.value);
  const position = asObject(value?.position_start);
  const mapName = textValue(position?.map) ?? quest.startMap;
  return (
    <aside className="order-2 min-w-0 lg:order-2">
      <button
        type="button"
        className="btn btn-ghost btn-sm w-full justify-between border border-base-300 lg:hidden"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Informations générales
        <ChevronDown size={16} className={open ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
      </button>
      <div className={(open ? "flex" : "hidden") + " mt-3 w-full flex-col items-center gap-2 text-center lg:mt-0 lg:flex"}>
        <span className={"badge badge-sm font-bold uppercase tracking-wide " + relationClasses[quest.relation]}>{relationLabels[quest.relation]}</span>
        {quest.npcImageUrl && (
          <figure className="shrink-0">
            <ExternalImage
              src={quest.npcImageUrl}
              alt={quest.npcName ? "Portrait de " + quest.npcName : "Portrait du PNJ"}
              className="mask mask-squircle h-16 w-16 bg-base-200 object-cover sm:h-20 sm:w-20"
              hideOnError
            />
          </figure>
        )}
        {quest.npcName && <p className="font-extrabold italic text-base-content">{quest.npcName}</p>}
        <GamePosition position={{
          map: mapName,
          position: textValue(position?.position),
          cmd: textValue(position?.cmd) ?? quest.travelCommand,
          x: quest.startX,
          y: quest.startY,
        }} label="Départ :" showMap={false} />
        {mapName && <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/60">{mapName}</p>}
        {quest.guideSummary && <QuestGuideFacts summary={quest.guideSummary} />}
      </div>
    </aside>
  );
}

export function QuestChecklist({
  guideId,
  stepNumber,
  quests,
  totalObjectives = quests.length,
  followers = [],
}: Readonly<{ guideId: number; stepNumber: number; quests: StepQuestDto[]; totalObjectives?: number; followers?: FollowedProfile[] }>) {
  const { profile, setObjectiveCompleted } = useProgress();
  const objectives = quests.map((quest) => ({ quest, identity: identityFor(guideId, stepNumber, quest) }));
  const firstIncomplete = objectives.find(({ identity }) => !isObjectiveCompleted(profile, identity))?.identity;
  const firstIncompleteKey = firstIncomplete === undefined ? null : identityKey(firstIncomplete);
  const completionSignature = objectives.map(({ identity }) => isObjectiveCompleted(profile, identity) ? "1" : "0").join("");
  const [expandedKey, setExpandedKey] = useState<string | null>(firstIncompleteKey);
  const previousCompletionSignature = useRef(completionSignature);
  const previousFirstIncompleteKey = useRef(firstIncompleteKey);

  useEffect(() => {
    const previous = previousCompletionSignature.current;
    const expandedIndex = objectives.findIndex(({ identity }) => identityKey(identity) === expandedKey);
    const expandedJustCompleted = expandedIndex >= 0
      && previous.charAt(expandedIndex) !== "1"
      && completionSignature.charAt(expandedIndex) === "1";
    if (expandedJustCompleted) {
      const next = objectives.slice(expandedIndex + 1).find(({ identity }) => !isObjectiveCompleted(profile, identity))
        ?? objectives.find(({ identity }) => !isObjectiveCompleted(profile, identity));
      setExpandedKey(next === undefined ? null : identityKey(next.identity));
    } else if (previousFirstIncompleteKey.current !== firstIncompleteKey) {
      setExpandedKey(firstIncompleteKey);
    }
    previousCompletionSignature.current = completionSignature;
    previousFirstIncompleteKey.current = firstIncompleteKey;
  }, [completionSignature, expandedKey, firstIncompleteKey, objectives, profile]);

  return (
    <ul className="list overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
      {objectives.map(({ quest, identity }) => {
        const key = identityKey(identity);
        const completed = isObjectiveCompleted(profile, identity);
        const current = firstIncomplete !== undefined
          && firstIncomplete.questKey === identity.questKey
          && firstIncomplete.relation === identity.relation
          && firstIncomplete.sortOrder === identity.sortOrder;
        const title = quest.originalName ?? quest.questKey;
        const expanded = expandedKey === key;
        const questFollowers = followers.filter((friend) => {
          const friendObjective = objectives.find((candidate) => !isObjectiveCompleted(friend.progress, candidate.identity))?.identity;
          return friendObjective?.questKey === identity.questKey
            && friendObjective.relation === identity.relation
            && friendObjective.sortOrder === identity.sortOrder;
        });

        return (
          <li className={"grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 border-b border-base-300 p-4 last:border-b-0 " + (current ? "quest-current bg-primary/5" : "")} key={JSON.stringify(identity)}>
            <input
              type="checkbox"
              className="checkbox checkbox-primary mt-0.5"
              checked={completed}
              onChange={(event) => setObjectiveCompleted(identity, event.currentTarget.checked, totalObjectives)}
              aria-label={"Valider " + title}
            />
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm h-auto min-h-8 min-w-0 flex-1 justify-start px-1 py-1 text-left"
                aria-expanded={expanded}
                aria-label={(expanded ? "Replier " : "Ouvrir ") + title}
                onClick={() => setExpandedKey((currentKey) => currentKey === key ? null : key)}
              >
                <span className={"min-w-0 flex-1 font-medium leading-snug " + (completed ? "line-through opacity-50" : "")}>{title}</span>
                <ChevronDown size={17} className={"shrink-0 transition-transform " + (expanded ? "rotate-180" : "")} aria-hidden="true" />
              </button>
              <FollowerAvatarStack profiles={questFollowers} />
            </div>
            {expanded && (
              <div className="col-span-2 mt-4 grid w-full items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <main className="relative z-20 order-1 min-w-0 overflow-visible">
                  {quest.guideSummary
                    ? <QuestGuideSummary summary={quest.guideSummary} objective={identity} totalObjectives={totalObjectives} followers={questFollowers} />
                    : quest.externalUrl && (
                      <a className="btn btn-primary btn-xs gap-1.5" href={quest.externalUrl} target="_blank" rel="noreferrer">
                        Guide DofusPourLesNoobs <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                </main>
                <QuestInformationPanel quest={quest} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
