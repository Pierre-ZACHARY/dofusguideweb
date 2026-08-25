import { describe, expect, it } from "vitest";
import { routeTree } from "../../src/web/routeTree.gen.js";

interface TestRoute { options?: { id?: string }; children?: TestRoute[] | Record<string, TestRoute> }
function routeIds(route: TestRoute): string[] {
  const children = route.children === undefined ? [] : Array.isArray(route.children) ? route.children : Object.values(route.children);
  return [...(route.options?.id ? [route.options.id] : []), ...children.flatMap(routeIds)];
}

describe("web routes", () => {
  it("expose toutes les routes produit importantes", () => {
    const paths = routeIds(routeTree as unknown as TestRoute);
    expect(paths).toEqual(expect.arrayContaining(["/", "/guides/", "/guides/$guideId", "/guides/$guideId_/steps/$stepNumber", "/quests/", "/quests/$questKey", "/progress", "/design-system"]));
  });
});
