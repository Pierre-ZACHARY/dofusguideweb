import { parseArgs } from "node:util";
import { loadBestiaryCatalog, queryBestiaryZone, resolveCoordinateSubarea } from "./bestiary/resolveBestiary.js";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  catalog: { type: "string", default: "data/dofusdb/bestiary.json" },
  "zone-hint": { type: "string" },
} });
const catalog = await loadBestiaryCatalog(values.catalog);
if (positionals[0] === "zone" && positionals[1]) {
  console.log(JSON.stringify(queryBestiaryZone(catalog, positionals.slice(1).join(" ")), null, 2));
} else if (positionals[0] === "coordinate" && positionals[1]) {
  const candidateIds = catalog.coordinates[positionals[1]] ?? [];
  const selectedId = resolveCoordinateSubarea(catalog, positionals[1], values["zone-hint"]);
  console.log(JSON.stringify({
    coordinate: positionals[1],
    zoneHint: values["zone-hint"] ?? null,
    selected: catalog.subareas.find((zone) => zone.id === selectedId) ?? null,
    candidates: candidateIds.flatMap((id) => {
      const zone = catalog.subareas.find((candidate) => candidate.id === id);
      return zone === undefined ? [] : [zone];
    }),
  }, null, 2));
} else {
  throw new Error('Usage: npm run query-bestiary -- zone "Village d\'Amakna" OR coordinate "7,-5" --zone-hint "Cloaque d\'Amakna"');
}
