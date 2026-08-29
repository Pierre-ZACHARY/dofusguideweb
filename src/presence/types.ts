import type { GuideRelation } from "../web/data/models.js";

export interface PresenceLocation {
  guideId: number;
  stepNumber: number;
}

export interface QuestHelpObjective extends PresenceLocation {
  questKey: string;
  relation: GuideRelation;
  sortOrder: number;
}

export interface QuestHelperPresence extends QuestHelpObjective {
  profileId: string;
  shareToken: string;
  name: string;
  avatarUrl: string | null;
  serverId: number;
  serverName: string;
}

export interface PresenceHeartbeatRequest {
  clientId: string;
  sessionId: string;
  location: PresenceLocation | null;
  help: QuestHelpObjective | null;
}

export interface PresenceSnapshot {
  activeTotal: number;
  activeOnServer: number | null;
  serverName: string | null;
  helpers: QuestHelperPresence[];
}

export interface PresenceInternalHeartbeat extends PresenceHeartbeatRequest {
  serverId: number | null;
  serverName: string | null;
  viewerProfileId: string | null;
  helper: QuestHelperPresence | null;
}

const RELATIONS = new Set<GuideRelation>(["START", "ACTIVE", "FINISH", "UNKNOWN"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePresenceLocation(value: unknown): PresenceLocation | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.guideId) || Number(value.guideId) === 0) return null;
  if (!Number.isInteger(value.stepNumber) || Number(value.stepNumber) <= 0) return null;
  return { guideId: Number(value.guideId), stepNumber: Number(value.stepNumber) };
}

export function parseQuestHelpObjective(value: unknown): QuestHelpObjective | null {
  const location = parsePresenceLocation(value);
  if (location === null || !isRecord(value)) return null;
  if (typeof value.questKey !== "string" || value.questKey.length < 1 || value.questKey.length > 200) return null;
  if (typeof value.relation !== "string" || !RELATIONS.has(value.relation as GuideRelation)) return null;
  if (!Number.isInteger(value.sortOrder) || Number(value.sortOrder) < 0) return null;
  return {
    ...location,
    questKey: value.questKey,
    relation: value.relation as GuideRelation,
    sortOrder: Number(value.sortOrder),
  };
}

export function sameHelpObjective(left: QuestHelpObjective | null, right: QuestHelpObjective): boolean {
  return left !== null
    && left.guideId === right.guideId
    && left.stepNumber === right.stepNumber
    && left.questKey === right.questKey
    && left.relation === right.relation
    && left.sortOrder === right.sortOrder;
}

export function helperMatchesObjective(helper: QuestHelperPresence, objective: QuestHelpObjective): boolean {
  return sameHelpObjective(helper, objective);
}
