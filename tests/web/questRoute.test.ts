import { describe, expect, it } from "vitest";
import { questKeyToRouteParam, routeParamToQuestKey } from "../../src/web/data/questRoute.js";

describe("quest route params", () => {
  it("uses portable numeric URLs for generated quest keys", () => {
    expect(questKeyToRouteParam("quest:1088")).toBe("1088");
    expect(routeParamToQuestKey("1088")).toBe("quest:1088");
  });

  it("keeps legacy and unknown identifiers readable", () => {
    expect(questKeyToRouteParam("legacy-key")).toBe("legacy-key");
    expect(routeParamToQuestKey("quest:1088")).toBe("quest:1088");
  });
});
