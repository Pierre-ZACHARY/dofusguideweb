import { AlertTriangle, Binoculars, BookOpen, ChevronDown, ExternalLink, PawPrint, Sparkles, Trophy } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { QuestGuideSummaryDto } from "../data/models.js";
import {
  isBestiaryObjectiveCompleted,
  isTutorialActionCompleted,
  useProgress,
  type BestiaryObjectiveIdentity,
  type ObjectiveIdentity,
  type TutorialActionIdentity,
} from "../progress/progressStore.js";
import { CopyableCoordinates } from "./CopyableCoordinates.js";
import { ExternalImage } from "./ExternalImage.js";
import type { FollowedProfile } from "../../accounts/types.js";
import { FollowerAvatarStack } from "../accounts/FollowerMarkers.js";
import { useDocumentOverlayEnvironment } from "./DocumentOverlay.js";
import { useOptionalAccount } from "../accounts/AccountProvider.js";
import { normalizeMetaMobMonsterName } from "../../metamob/client.js";
import { CopyableItemName } from "./CopyableItemName.js";

type TutorialItem = QuestGuideSummaryDto["items"][number];

function canonicalText(value: string): string {
  return value.replace(/[’‘]/gu, "'").toLocaleLowerCase("fr-FR");
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

export interface RichTextPart {
  text: string;
  term: string | null;
}

export function splitRichTextTerms(text: string, terms: string[]): RichTextPart[] {
  const candidates = [...new Set(terms)]
    .filter((term) => term.length > 1)
    .sort((left, right) => right.length - left.length)
    .map((term) => ({ term, canonical: canonicalText(term) }));
  if (candidates.length === 0) return [{ text, term: null }];

  const canonical = canonicalText(text);
  const parts: RichTextPart[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let next: { index: number; term: string; length: number } | null = null;
    for (const candidate of candidates) {
      let index = canonical.indexOf(candidate.canonical, cursor);
      while (index !== -1) {
        const before = index === 0 ? undefined : text[index - 1];
        const afterIndex = index + candidate.canonical.length;
        const after = afterIndex >= text.length ? undefined : text[afterIndex];
        const startsWithWord = isWordCharacter(candidate.term[0]);
        const endsWithWord = isWordCharacter(candidate.term.at(-1));
        if ((!startsWithWord || !isWordCharacter(before)) && (!endsWithWord || !isWordCharacter(after))) break;
        index = canonical.indexOf(candidate.canonical, index + 1);
      }
      if (index !== -1 && (next === null || index < next.index || (index === next.index && candidate.term.length > next.length))) {
        next = { index, term: candidate.term, length: candidate.canonical.length };
      }
    }
    if (next === null) {
      parts.push({ text: text.slice(cursor), term: null });
      break;
    }
    if (next.index > cursor) parts.push({ text: text.slice(cursor, next.index), term: null });
    parts.push({ text: text.slice(next.index, next.index + next.length), term: next.term });
    cursor = next.index + next.length;
  }
  return parts;
}

function InlineItem({ item, label }: Readonly<{ item: TutorialItem; label: string }>) {
  const content = <><ExternalImage src={item.imageUrl} alt="" className="h-4 w-4 shrink-0 object-contain" hideOnError /><strong>{label}</strong></>;
  return <CopyableItemName
    name={item.name}
    className="badge badge-outline mx-0.5 inline-flex h-auto cursor-copy gap-1 px-1.5 py-0.5 align-middle text-current hover:badge-primary"
  >{content}</CopyableItemName>;
}

function RichText({ text, summary }: Readonly<{ text: string; summary: QuestGuideSummaryDto }>) {
  const terms = [...new Set([...summary.npcs, ...summary.items.map((item) => item.name)])]
    .filter((term) => term.length > 1)
    .sort((left, right) => right.length - left.length);
  if (terms.length === 0) return <CopyableCoordinates text={text} />;
  const normalizedNpcs = new Set(summary.npcs.map(canonicalText));
  const items = new Map(summary.items.map((item) => [canonicalText(item.name), item]));
  return <>{splitRichTextTerms(text, terms).map((part, index) => {
    const canonical = canonicalText(part.term ?? "");
    const item = items.get(canonical);
    if (item !== undefined) return <InlineItem key={index + ":" + part.text} item={item} label={part.text} />;
    if (normalizedNpcs.has(canonical)) return <strong key={index + ":" + part.text}>{part.text}</strong>;
    return <CopyableCoordinates key={index + ":" + part.text} text={part.text} />;
  })}</>;
}

function RewardIcon({ reward }: Readonly<{ reward: "xp" | "kamas" | undefined }>) {
  const src = reward === "xp" ? "/ui/xp.webp" : reward === "kamas" ? "/ui/kamas.webp" : null;
  if (src === null) return null;
  return <ExternalImage src={src} alt="" className="h-7 w-7 shrink-0 object-contain" hideOnError />;
}

function SummaryList({ title, entries, summary, rewards = false }: Readonly<{
  title: string;
  entries: string[];
  summary: QuestGuideSummaryDto;
  rewards?: boolean;
}>) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded-box bg-base-200/70 p-3">
      <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-base-content/65">{title}</h4>
      <ul className="space-y-2 text-sm leading-snug text-base-content/85">
        {entries.map((entry) => {
          const reward = rewards ? (/\bxp\b/iu.test(entry) ? "xp" : /\bkamas?\b/iu.test(entry) ? "kamas" : undefined) : undefined;
          const displayedEntry = reward === "xp" ? entry.replace(/\s*XP\s*$/iu, "").trim() : entry;
          return (
            <li className={"flex gap-2 " + (rewards ? "items-center" : "items-start")} key={entry}>
              <RewardIcon reward={reward} />
              <span><RichText text={displayedEntry} summary={summary} /></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CombatIcons({ combat }: Readonly<{ combat: QuestGuideSummaryDto["actions"][number]["combat"] }>) {
  const icons: ReactNode[] = [];
  if (combat === "SOLO" || combat === "CHOICE") icons.push(<img key="solo" src="/ui/combat-solo.png" alt="Combat solo" className="h-7 w-7 object-contain" />);
  if (combat === "GROUP" || combat === "CHOICE") icons.push(<img key="group" src="/ui/combat-group.png" alt="Combat en groupe" className="h-7 w-7 object-contain" />);
  return icons.length === 0 ? null : <span className="flex shrink-0 gap-1" title={combat === "SOLO" ? "Combat solo" : combat === "GROUP" ? "Combat en groupe" : "Combat au choix"}>{icons}</span>;
}

type BestiaryData = NonNullable<QuestGuideSummaryDto["bestiary"]>;
type BestiaryMonster = BestiaryData["bounties"][number];

function BestiaryMonsterRow({ monster, objective }: Readonly<{ monster: BestiaryMonster; objective: BestiaryObjectiveIdentity }>) {
  const { profile, setBestiaryObjectiveCompleted } = useProgress();
  const account = useOptionalAccount();
  const [pending, setPending] = useState(false);
  const metaMobMonster = objective.kind === "ARCHMONSTER" && account?.metaMob?.link
    ? account.metaMob.archmonsters.find((candidate) => candidate.id === monster.id
      || normalizeMetaMobMonsterName(candidate.name) === normalizeMetaMobMonsterName(monster.name))
    : undefined;
  const checked = metaMobMonster === undefined
    ? isBestiaryObjectiveCompleted(profile, objective)
    : metaMobMonster.quantity > 0;
  async function changeCompleted(completed: boolean) {
    if (objective.kind === "ARCHMONSTER" && account?.metaMob?.link) {
      setPending(true);
      try {
        await account.setMetaMobArchmonster(monster.id, monster.name, completed);
        setBestiaryObjectiveCompleted(objective, completed);
      } finally {
        setPending(false);
      }
      return;
    }
    setBestiaryObjectiveCompleted(objective, completed);
  }
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-box px-1 py-1.5 hover:bg-base-300/60">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-xs"
        checked={checked}
        disabled={pending}
        onChange={(event) => void changeCompleted(event.currentTarget.checked)}
      />
      <ExternalImage src={monster.imageUrl} alt="" className="h-9 w-9 shrink-0 object-contain" hideOnError />
      <span className={"min-w-0 flex-1 text-sm font-semibold " + (checked ? "line-through opacity-55" : "")}>{monster.name}</span>
      <span className="text-xs tabular-nums text-base-content/55">Niv. {monster.level}</span>
    </label>
  );
}

function BestiarySection({ title, icon, children }: Readonly<{ title: string; icon: ReactNode; children: ReactNode }>) {
  return (
    <section className="rounded-box bg-base-200/70 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-base-content/65">{icon}{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function QuestBestiaryFacts({ summary }: Readonly<{ summary: QuestGuideSummaryDto }>) {
  const bestiary = summary.bestiary;
  if (bestiary === undefined) return null;
  if (bestiary.zones.length + bestiary.bounties.length + bestiary.archmonsters.length + bestiary.achievements.length === 0) return null;
  return (
    <>
      {bestiary.zones.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bestiary.zones.map((zone) => <span className="badge badge-ghost badge-sm" key={zone.id}>{zone.name}</span>)}
        </div>
      )}
      {bestiary.bounties.length > 0 && (
        <BestiarySection title="Avis de recherche" icon={<Binoculars size={14} aria-hidden="true" />}>
          {bestiary.bounties.map((monster) => <BestiaryMonsterRow key={monster.id} monster={monster} objective={{ kind: "BOUNTY", monsterId: monster.id }} />)}
        </BestiarySection>
      )}
      {bestiary.archmonsters.length > 0 && (
        <BestiarySection title="Archimonstres" icon={<PawPrint size={14} aria-hidden="true" />}>
          {bestiary.archmonsters.map((monster) => <BestiaryMonsterRow key={monster.id} monster={monster} objective={{ kind: "ARCHMONSTER", monsterId: monster.id }} />)}
        </BestiarySection>
      )}
      {bestiary.achievements.map((achievement) => (
        <div className="collapse collapse-arrow rounded-box bg-base-200/70" key={achievement.id}>
          <input type="checkbox" defaultChecked />
          <div className="collapse-title flex min-h-0 items-center gap-1.5 px-3 py-3 text-xs font-extrabold uppercase tracking-wide text-base-content/65">
            <Trophy size={14} aria-hidden="true" /> Succès · {achievement.name}
          </div>
          <div className="collapse-content px-2 pb-2">
            {achievement.monsters.map((monster) => (
              <BestiaryMonsterRow
                key={monster.id}
                monster={monster}
                objective={{ kind: "ACHIEVEMENT_MONSTER", achievementId: achievement.id, monsterId: monster.id }}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function QuestGuideFacts({ summary }: Readonly<{ summary: QuestGuideSummaryDto }>) {
  return (
    <div className="w-full space-y-3 text-left">
      {summary.recommendedLevel !== null && <div className="badge badge-outline">Niveau conseillé {summary.recommendedLevel}</div>}
      <SummaryList title="Prérequis" entries={summary.prerequisites} summary={summary} />
      <SummaryList title="À préparer" entries={summary.preparation} summary={summary} />
      <SummaryList title="Récompenses" entries={summary.rewards} summary={summary} rewards />
      <SummaryList title="À retenir" entries={summary.notes} summary={summary} />
      <QuestBestiaryFacts summary={summary} />
    </div>
  );
}

export function QuestGuideSummary({ summary, objective, totalObjectives, followers = [] }: Readonly<{
  summary: QuestGuideSummaryDto;
  objective: ObjectiveIdentity;
  totalObjectives: number;
  followers?: FollowedProfile[];
}>) {
  const { profile, setTutorialActionCompleted } = useProgress();
  const inOverlay = useDocumentOverlayEnvironment();
  const tutorialId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
    setOpen(!inOverlay && desktop);
  }, [inOverlay]);
  const actionIdentities: TutorialActionIdentity[] = summary.actions.map((_action, actionIndex) => ({ ...objective, actionIndex }));
  const completedActions = actionIdentities.filter((action) => isTutorialActionCompleted(profile, action)).length;
  const progress = summary.actions.length === 0 ? 0 : Math.round(completedActions / summary.actions.length * 100);
  return (
    <section className="tutorial-shell w-full overflow-hidden rounded-box border border-primary/30 bg-base-100">
      <header className={"tutorial-header flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm font-bold text-base-content " + (open ? "border-b border-base-300" : "")}>
        <button
          type="button"
          className="btn btn-ghost btn-sm min-w-0 flex-1 justify-start gap-2"
          aria-expanded={open}
          aria-controls={tutorialId}
          aria-label={open ? "Replier le tutoriel" : "Ouvrir le tutoriel"}
          onClick={() => setOpen((current) => !current)}
        >
          <BookOpen size={17} aria-hidden="true" />
          <span>Tutoriel</span>
          <span className="badge badge-secondary badge-sm gap-1"><Sparkles size={11} aria-hidden="true" />Résumé IA</span>
          <ChevronDown size={16} className={"ml-auto shrink-0 transition-transform " + (open ? "rotate-180" : "")} aria-hidden="true" />
        </button>
        <a className="btn btn-neutral btn-xs gap-1.5" href={summary.sourceUrl} target="_blank" rel="noreferrer">
          Guide DofusPourLesNoobs <ExternalLink size={13} aria-hidden="true" />
        </a>
      </header>
      {open && <div className="space-y-5 p-4 text-base-content" id={tutorialId}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-base-content/65">
            <span>Progression du tutoriel</span>
            <span className="tabular-nums">{completedActions}/{summary.actions.length}</span>
          </div>
          <progress className="tutorial-progress progress progress-primary h-1.5 w-full" value={progress} max="100" aria-label={"Progression du tutoriel : " + completedActions + " sur " + summary.actions.length} />
        </div>
        <p className="text-sm leading-relaxed text-base-content/85"><RichText text={summary.overview} summary={summary} /></p>
        <section className="min-w-0">
          <div className="divider mt-0">Parcours conseillé</div>
          <ol className="space-y-2">
            {summary.actions.map((action, index) => {
              const actionIdentity = actionIdentities[index]!;
              const checked = isTutorialActionCompleted(profile, actionIdentity);
              const actionFollowers = followers.filter((friend) => {
                const firstIncomplete = actionIdentities.findIndex((candidate) => !isTutorialActionCompleted(friend.progress, candidate));
                return firstIncomplete === index;
              });
              return (
              <li className="tutorial-action rounded-box bg-base-200 p-3" key={index + ":" + action.instruction}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0"
                    checked={checked}
                    onChange={(event) => setTutorialActionCompleted(actionIdentity, event.currentTarget.checked, summary.actions.length, totalObjectives)}
                    aria-label={"Valider la sous-étape " + (index + 1)}
                  />
                  <span className="badge badge-neutral badge-sm mt-0.5 shrink-0">{index + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className={"text-sm leading-relaxed " + (checked ? "line-through opacity-55" : "")}><RichText text={action.instruction} summary={summary} /></p>
                    {action.position && <p className="text-sm"><CopyableCoordinates text={action.position} /></p>}
                  </div>
                  <FollowerAvatarStack profiles={actionFollowers} />
                  <CombatIcons combat={action.combat} />
                </div>
                {action.warning && <div className="tutorial-warning alert mt-3 py-2 text-xs"><AlertTriangle size={15} aria-hidden="true" /><span><RichText text={action.warning} summary={summary} /></span></div>}
              </li>
              );
            })}
          </ol>
        </section>
        <p className="text-xs text-base-content/55">Résumé reformulé automatiquement à partir de {summary.sourceTitle}. Le guide source reste la référence complète.</p>
      </div>}
    </section>
  );
}
