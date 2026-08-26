const QUEST_KEY_PREFIX = "quest:";

export function questKeyToRouteParam(questKey: string): string {
  return questKey.startsWith(QUEST_KEY_PREFIX)
    ? questKey.slice(QUEST_KEY_PREFIX.length)
    : questKey;
}

export function routeParamToQuestKey(routeParam: string): string {
  return /^\d+$/.test(routeParam)
    ? QUEST_KEY_PREFIX + routeParam
    : routeParam;
}
