import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GuideRelation } from "../data/models.js";
import { useOptionalAccount } from "../accounts/AccountProvider.js";

export type StepProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type QuestProgressStatus = "NOT_STARTED" | "STARTED" | "ACTIVE" | "COMPLETED" | "SKIPPED";

export interface ObjectiveIdentity {
  guideId: number;
  stepNumber: number;
  questKey: string;
  relation: GuideRelation;
  sortOrder: number;
}

export interface DungeonSuccessIdentity {
  guideId: number;
  stepNumber: number;
  dungeonKey: string;
  successId: string;
}

export interface TutorialActionIdentity extends ObjectiveIdentity {
  actionIndex: number;
}

export type BestiaryObjectiveKind = "ARCHMONSTER" | "BOUNTY" | "ACHIEVEMENT_MONSTER";
export interface BestiaryObjectiveIdentity {
  kind: BestiaryObjectiveKind;
  monsterId: number;
  achievementId?: number;
}

export interface ProgressProfile {
  version: 2;
  steps: Record<string, StepProgressStatus>;
  quests: Record<string, QuestProgressStatus>;
  objectives: Record<string, true>;
  dungeonSuccesses: Record<string, true>;
  tutorialActions: Record<string, true>;
  bestiaryObjectives?: Record<string, true>;
}

interface LegacyProgressProfile {
  version: 1;
  steps: Record<string, StepProgressStatus>;
  quests: Record<string, QuestProgressStatus>;
}

interface ProgressContextValue {
  hydrated: boolean;
  profile: ProgressProfile;
  setStepStatus: (guideId: number, step: number, status: StepProgressStatus) => void;
  setStepsStatus: (guideId: number, steps: number[], status: StepProgressStatus) => void;
  setQuestStatus: (questKey: string, status: QuestProgressStatus) => void;
  setObjectiveCompleted: (objective: ObjectiveIdentity, completed: boolean, totalObjectives: number) => void;
  setTutorialActionCompleted: (action: TutorialActionIdentity, completed: boolean, totalActions: number, totalObjectives: number) => void;
  setDungeonSuccessCompleted: (success: DungeonSuccessIdentity, completed: boolean) => void;
  setBestiaryObjectiveCompleted: (objective: BestiaryObjectiveIdentity, completed: boolean) => void;
}

const STORAGE_KEY = "dofusguide.progress.v2";
const LEGACY_STORAGE_KEY = "dofusguide.progress.v1";
const emptyProfile = (): ProgressProfile => ({ version: 2, steps: {}, quests: {}, objectives: {}, dungeonSuccesses: {}, tutorialActions: {}, bestiaryObjectives: {} });
const ProgressContext = createContext<ProgressContextValue | null>(null);
const stepStorageKey = (guideId: number, step: number) => guideId + ":" + step;

export function objectiveKey(objective: ObjectiveIdentity): string {
  return JSON.stringify([objective.guideId, objective.stepNumber, objective.questKey, objective.relation, objective.sortOrder]);
}

export function dungeonSuccessKey(success: DungeonSuccessIdentity): string {
  return JSON.stringify([success.guideId, success.stepNumber, success.dungeonKey, success.successId]);
}

export function tutorialActionKey(action: TutorialActionIdentity): string {
  return JSON.stringify([action.guideId, action.stepNumber, action.questKey, action.relation, action.sortOrder, action.actionIndex]);
}

export function bestiaryObjectiveKey(objective: BestiaryObjectiveIdentity): string {
  return JSON.stringify([objective.kind, objective.achievementId ?? null, objective.monsterId]);
}

function parseTutorialActionKey(key: string): TutorialActionIdentity | null {
  try {
    const value = JSON.parse(key) as unknown;
    if (!Array.isArray(value) || value.length !== 6) return null;
    const [guideId, stepNumber, questKey, relation, sortOrder, actionIndex] = value;
    if (typeof guideId !== "number" || typeof stepNumber !== "number" || typeof questKey !== "string" || typeof sortOrder !== "number" || typeof actionIndex !== "number") return null;
    if (relation !== "START" && relation !== "ACTIVE" && relation !== "FINISH" && relation !== "UNKNOWN") return null;
    return { guideId, stepNumber, questKey, relation, sortOrder, actionIndex };
  } catch {
    return null;
  }
}

function parseDungeonSuccessKey(key: string): DungeonSuccessIdentity | null {
  try {
    const value = JSON.parse(key) as unknown;
    if (!Array.isArray(value) || value.length !== 4) return null;
    const [guideId, stepNumber, dungeonKey, successId] = value;
    return typeof guideId === "number" && typeof stepNumber === "number" && typeof dungeonKey === "string" && typeof successId === "string"
      ? { guideId, stepNumber, dungeonKey, successId }
      : null;
  } catch {
    return null;
  }
}

export function parseObjectiveKey(key: string): ObjectiveIdentity | null {
  try {
    const value = JSON.parse(key) as unknown;
    if (!Array.isArray(value) || value.length !== 5) return null;
    const [guideId, stepNumber, questKey, relation, sortOrder] = value;
    if (typeof guideId !== "number" || typeof stepNumber !== "number" || typeof questKey !== "string" || typeof sortOrder !== "number") return null;
    if (relation !== "START" && relation !== "ACTIVE" && relation !== "FINISH" && relation !== "UNKNOWN") return null;
    return { guideId, stepNumber, questKey, relation, sortOrder };
  } catch {
    return null;
  }
}

function parseProfile(raw: string | null): ProgressProfile | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProgressProfile>;
    return value.version === 2 && typeof value.steps === "object" && typeof value.quests === "object" && typeof value.objectives === "object"
      ? { version: 2, steps: value.steps ?? {}, quests: value.quests ?? {}, objectives: value.objectives ?? {}, dungeonSuccesses: value.dungeonSuccesses ?? {}, tutorialActions: value.tutorialActions ?? {}, bestiaryObjectives: value.bestiaryObjectives ?? {} }
      : null;
  } catch {
    return null;
  }
}

function parseLegacyProfile(raw: string | null): ProgressProfile | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<LegacyProgressProfile>;
    return value.version === 1 && typeof value.steps === "object" && typeof value.quests === "object"
      ? { version: 2, steps: value.steps ?? {}, quests: value.quests ?? {}, objectives: {}, dungeonSuccesses: {}, tutorialActions: {}, bestiaryObjectives: {} }
      : null;
  } catch {
    return null;
  }
}

export function questStatusForCompletedRelations(relations: GuideRelation[]): QuestProgressStatus {
  if (relations.some((relation) => relation === "ACTIVE" || relation === "FINISH")) return "COMPLETED";
  if (relations.includes("START")) return "STARTED";
  if (relations.includes("UNKNOWN")) return "ACTIVE";
  return "NOT_STARTED";
}

function questStatusFromObjectives(objectives: Record<string, true>, questKey: string): QuestProgressStatus {
  const relations = Object.keys(objectives)
    .map(parseObjectiveKey)
    .filter((objective): objective is ObjectiveIdentity => objective?.questKey === questKey)
    .map((objective) => objective.relation);
  return questStatusForCompletedRelations(relations);
}

function completedQuestCountForStep(objectives: Record<string, true>, guideId: number, stepNumber: number): number {
  return Object.keys(objectives)
    .map(parseObjectiveKey)
    .filter((item) => item?.guideId === guideId && item.stepNumber === stepNumber)
    .length;
}

function derivedStepStatus(completed: number, total: number): StepProgressStatus {
  if (completed === 0) return "NOT_STARTED";
  return completed >= total ? "COMPLETED" : "IN_PROGRESS";
}

function withObjectiveCompletion(current: ProgressProfile, objective: ObjectiveIdentity, completed: boolean, totalObjectives: number): ProgressProfile {
  const key = objectiveKey(objective);
  const objectives = { ...current.objectives };
  if (completed) objectives[key] = true;
  else delete objectives[key];
  const completedInStep = completedQuestCountForStep(objectives, objective.guideId, objective.stepNumber);
  return {
    ...current,
    objectives,
    steps: { ...current.steps, [stepStorageKey(objective.guideId, objective.stepNumber)]: derivedStepStatus(completedInStep, totalObjectives) },
    quests: { ...current.quests, [objective.questKey]: questStatusFromObjectives(objectives, objective.questKey) },
  };
}

export function ProgressProvider({ children }: Readonly<{ children: ReactNode }>) {
  const account = useOptionalAccount();
  const [profile, setProfile] = useState<ProgressProfile>(emptyProfile);
  const [hydrated, setHydrated] = useState(false);
  const cloudProfileId = useRef<string | null>(null);
  const cloudRevision = useRef<number | null>(null);
  const localChangeVersion = useRef(0);
  const savedChangeVersion = useRef(0);

  const updateLocalProfile = useCallback((updater: (current: ProgressProfile) => ProgressProfile) => {
    localChangeVersion.current += 1;
    setProfile(updater);
  }, []);

  useEffect(() => {
    setProfile(parseProfile(localStorage.getItem(STORAGE_KEY)) ?? parseLegacyProfile(localStorage.getItem(LEGACY_STORAGE_KEY)) ?? emptyProfile());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const activeProfile = account?.activeProfile;
    if (activeProfile === null || activeProfile === undefined) return;
    const profileChanged = cloudProfileId.current !== activeProfile.id;
    const revisionChanged = cloudRevision.current !== activeProfile.revision;
    if (!profileChanged && !revisionChanged) return;
    cloudProfileId.current = activeProfile.id;
    cloudRevision.current = activeProfile.revision;
    if (profileChanged || localChangeVersion.current === savedChangeVersion.current) {
      localChangeVersion.current = 0;
      savedChangeVersion.current = 0;
      setProfile({ ...activeProfile.progress, bestiaryObjectives: activeProfile.progress.bestiaryObjectives ?? {} });
      setHydrated(true);
    }
  }, [account?.activeProfile?.id, account?.activeProfile?.revision]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    const activeProfile = account?.activeProfile;
    const saveCloudProgress = account?.saveProgress;
    if (activeProfile === null || activeProfile === undefined || saveCloudProgress === undefined) return;
    if (localChangeVersion.current === savedChangeVersion.current) return;
    const changeVersion = localChangeVersion.current;
    const profileSnapshot = profile;
    const timer = window.setTimeout(() => {
      void saveCloudProgress(activeProfile.id, profileSnapshot).then(() => {
        if (cloudProfileId.current === activeProfile.id) {
          savedChangeVersion.current = Math.max(savedChangeVersion.current, changeVersion);
        }
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [hydrated, profile, account?.activeProfile?.id, account?.saveProgress]);

  const setStepStatus = useCallback((guideId: number, step: number, status: StepProgressStatus) => {
    updateLocalProfile((current) => ({ ...current, steps: { ...current.steps, [stepStorageKey(guideId, step)]: status } }));
  }, [updateLocalProfile]);

  const setStepsStatus = useCallback((guideId: number, steps: number[], status: StepProgressStatus) => {
    updateLocalProfile((current) => {
      const nextSteps = { ...current.steps };
      for (const step of steps) nextSteps[stepStorageKey(guideId, step)] = status;
      if (status !== "NOT_STARTED") return { ...current, steps: nextSteps };

      const targetSteps = new Set(steps);
      const removedQuestKeys = new Set<string>();
      const objectives = Object.fromEntries(Object.entries(current.objectives).filter(([key]) => {
        const objective = parseObjectiveKey(key);
        const keep = objective?.guideId !== guideId || !targetSteps.has(objective.stepNumber);
        if (!keep && objective) removedQuestKeys.add(objective.questKey);
        return keep;
      })) as Record<string, true>;
      const dungeonSuccesses = Object.fromEntries(Object.entries(current.dungeonSuccesses).filter(([key]) => {
        const success = parseDungeonSuccessKey(key);
        return success?.guideId !== guideId || !targetSteps.has(success.stepNumber);
      })) as Record<string, true>;
      const tutorialActions = Object.fromEntries(Object.entries(current.tutorialActions).filter(([key]) => {
        const action = parseTutorialActionKey(key);
        return action?.guideId !== guideId || !targetSteps.has(action.stepNumber);
      })) as Record<string, true>;
      const quests = { ...current.quests };
      for (const questKey of removedQuestKeys) quests[questKey] = questStatusFromObjectives(objectives, questKey);
      return { ...current, steps: nextSteps, objectives, dungeonSuccesses, tutorialActions, quests };
    });
  }, [updateLocalProfile]);

  const setQuestStatus = useCallback((questKey: string, status: QuestProgressStatus) => {
    updateLocalProfile((current) => ({ ...current, quests: { ...current.quests, [questKey]: status } }));
  }, [updateLocalProfile]);

  const setObjectiveCompleted = useCallback((objective: ObjectiveIdentity, completed: boolean, totalObjectives: number) => {
    updateLocalProfile((current) => {
      const tutorialActions = completed ? current.tutorialActions : Object.fromEntries(Object.entries(current.tutorialActions).filter(([key]) => {
        const action = parseTutorialActionKey(key);
        return action?.guideId !== objective.guideId || action.stepNumber !== objective.stepNumber || action.questKey !== objective.questKey || action.relation !== objective.relation || action.sortOrder !== objective.sortOrder;
      })) as Record<string, true>;
      return withObjectiveCompletion({ ...current, tutorialActions }, objective, completed, totalObjectives);
    });
  }, [updateLocalProfile]);

  const setTutorialActionCompleted = useCallback((action: TutorialActionIdentity, completed: boolean, totalActions: number, totalObjectives: number) => {
    updateLocalProfile((current) => {
      const tutorialActions = { ...current.tutorialActions };
      const key = tutorialActionKey(action);
      if (completed) tutorialActions[key] = true;
      else delete tutorialActions[key];
      const completedActions = Object.keys(tutorialActions).map(parseTutorialActionKey).filter((candidate) =>
        candidate?.guideId === action.guideId
        && candidate.stepNumber === action.stepNumber
        && candidate.questKey === action.questKey
        && candidate.relation === action.relation
        && candidate.sortOrder === action.sortOrder,
      ).length;
      return withObjectiveCompletion({ ...current, tutorialActions }, action, completedActions >= totalActions, totalObjectives);
    });
  }, [updateLocalProfile]);

  const setDungeonSuccessCompleted = useCallback((success: DungeonSuccessIdentity, completed: boolean) => {
    updateLocalProfile((current) => {
      const key = dungeonSuccessKey(success);
      const dungeonSuccesses = { ...current.dungeonSuccesses };
      if (completed) dungeonSuccesses[key] = true;
      else delete dungeonSuccesses[key];
      return { ...current, dungeonSuccesses };
    });
  }, [updateLocalProfile]);

  const setBestiaryObjectiveCompleted = useCallback((objective: BestiaryObjectiveIdentity, completed: boolean) => {
    updateLocalProfile((current) => {
      const bestiaryObjectives = { ...current.bestiaryObjectives };
      const key = bestiaryObjectiveKey(objective);
      if (completed) bestiaryObjectives[key] = true;
      else delete bestiaryObjectives[key];
      return { ...current, bestiaryObjectives };
    });
  }, [updateLocalProfile]);

  const value = useMemo(
    () => ({ hydrated, profile, setStepStatus, setStepsStatus, setQuestStatus, setObjectiveCompleted, setTutorialActionCompleted, setDungeonSuccessCompleted, setBestiaryObjectiveCompleted }),
    [hydrated, profile, setStepStatus, setStepsStatus, setQuestStatus, setObjectiveCompleted, setTutorialActionCompleted, setDungeonSuccessCompleted, setBestiaryObjectiveCompleted],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const value = useContext(ProgressContext);
  if (value === null) throw new Error("useProgress must be used inside ProgressProvider");
  return value;
}

export function getStepProgress(profile: Pick<ProgressProfile, "steps">, guideId: number, step: number): StepProgressStatus {
  return profile.steps[stepStorageKey(guideId, step)] ?? "NOT_STARTED";
}

export function getQuestProgress(profile: Pick<ProgressProfile, "quests">, questKey: string): QuestProgressStatus {
  return profile.quests[questKey] ?? "NOT_STARTED";
}

export function isObjectiveCompleted(profile: Pick<ProgressProfile, "objectives" | "steps">, objective: ObjectiveIdentity): boolean {
  return profile.objectives[objectiveKey(objective)] === true || getStepProgress(profile, objective.guideId, objective.stepNumber) === "COMPLETED";
}

export function isDungeonSuccessCompleted(profile: Pick<ProgressProfile, "dungeonSuccesses">, success: DungeonSuccessIdentity): boolean {
  return profile.dungeonSuccesses[dungeonSuccessKey(success)] === true;
}

export function isTutorialActionCompleted(
  profile: Pick<ProgressProfile, "tutorialActions" | "objectives" | "steps">,
  action: TutorialActionIdentity,
): boolean {
  return profile.tutorialActions[tutorialActionKey(action)] === true || isObjectiveCompleted(profile, action);
}

export function isBestiaryObjectiveCompleted(profile: Pick<ProgressProfile, "bestiaryObjectives">, objective: BestiaryObjectiveIdentity): boolean {
  return profile.bestiaryObjectives?.[bestiaryObjectiveKey(objective)] === true;
}
