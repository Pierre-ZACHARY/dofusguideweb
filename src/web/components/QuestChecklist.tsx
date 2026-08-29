import { ChevronDown, ExternalLink, HandHelping } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GuideRelation, StepQuestDto } from "../data/models.js";
import { isObjectiveCompleted, useProgress, type ObjectiveIdentity } from "../progress/progressStore.js";
import { ExternalImage } from "./ExternalImage.js";
import { GamePosition } from "./GamePosition.js";
import { QuestGuideFacts, QuestGuideSummary } from "./QuestGuideSummary.js";
import { asObject, textValue } from "./valueUtils.js";
import type { FollowedProfile } from "../../accounts/types.js";
import { FollowerAvatarStack } from "../accounts/FollowerMarkers.js";
import { helperMatchesObjective, sameHelpObjective, type QuestHelperPresence } from "../../presence/types.js";
import { useOptionalPresence } from "../presence/PresenceProvider.js";

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

function HelperAvatarStack({ helpers }: Readonly<{ helpers: QuestHelperPresence[] }>) {
  if (helpers.length === 0) return null;
  return (
    <div className="flex -space-x-2" aria-label={helpers.length + " joueur(s) demande(nt) de l’aide"}>
      {helpers.slice(0, 4).map((helper) => (
        <a
          key={helper.profileId}
          className="avatar tooltip tooltip-left z-10 transition-transform hover:z-20 hover:-translate-y-0.5"
          data-tip={helper.name + " demande de l’aide sur " + helper.serverName}
          href={"/shared/" + encodeURIComponent(helper.shareToken)}
        >
          <div className="h-8 w-8 rounded-full border-2 border-warning bg-base-200 ring-1 ring-base-100">
            {helper.avatarUrl
              ? <img src={helper.avatarUrl} alt={helper.name} />
              : <HandHelping className="m-1.5 h-4 w-4 text-warning" aria-hidden="true" />}
          </div>
        </a>
      ))}
      {helpers.length > 4 && <span className="badge badge-warning badge-sm z-20 self-center">+{helpers.length - 4}</span>}
    </div>
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
  const presence = useOptionalPresence();
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
        const helpObjective = { ...identity };
        const questHelpers = presence?.helpers.filter((helper) => helperMatchesObjective(helper, helpObjective)) ?? [];
        const requestingHelp = presence !== null && sameHelpObjective(presence.activeHelp, helpObjective);

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
              <HelperAvatarStack helpers={questHelpers} />
            </div>
            {expanded && (
              <div className="col-span-2 mt-4 grid w-full items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <main className="relative z-20 order-1 min-w-0 overflow-visible">
                  {presence && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-200/60 p-3">
                    <button
                      type="button"
                      className={"btn btn-sm gap-2 " + (requestingHelp ? "btn-warning" : "btn-outline")}
                      disabled={!presence.canRequestHelp}
                      aria-pressed={requestingHelp}
                      title={presence.canRequestHelp ? undefined : "Connectez-vous avec un personnage et un serveur DOFUS vérifiés"}
                      onClick={() => presence.toggleHelp(helpObjective)}
                    >
                      <HandHelping size={16} aria-hidden="true" />
                      {requestingHelp ? "Ne plus demander d’aide" : "J’ai besoin d’aide"}
                    </button>
                    <span className="text-xs text-base-content/65">
                      {questHelpers.length > 0
                        ? questHelpers.length + " joueur" + (questHelpers.length > 1 ? "s" : "") + " disponible" + (questHelpers.length > 1 ? "s" : "") + " sur votre serveur"
                        : presence.canRequestHelp ? "Votre profil public sera visible ici pendant votre demande." : "Un personnage et un serveur vérifiés sont nécessaires."}
                    </span>
                    {requestingHelp && presence.error && <span className="text-xs text-error">{presence.error}</span>}
                  </div>}
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
