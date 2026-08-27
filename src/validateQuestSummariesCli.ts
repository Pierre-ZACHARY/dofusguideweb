import { parseArgs } from "node:util";
import { loadQuestGuideStepArchive } from "./questGuides/resolveQuestGuides.js";
import { SqliteDofusGuideRepository } from "./repositories/sqliteDofusGuideRepository.js";

const { values } = parseArgs({ options: {
  guide: { type: "string", default: "-1" },
  db: { type: "string", default: "data/dofusguide.sqlite" },
  input: { type: "string", default: "data/generated/quest-summaries" },
} });

const guideId = Number(values.guide);
if (!Number.isInteger(guideId)) throw new Error("--guide must be an integer");
const repository = new SqliteDofusGuideRepository(values.db);
try {
  const steps = repository.listGuideSteps(guideId).filter((step) => step.title !== null);
  let summaryCount = 0;
  let tipCount = 0;
  let missingSummaryCount = 0;
  for (const stepSummary of steps) {
    const step = repository.getGuideStep(guideId, stepSummary.stepNumber);
    if (step === undefined) throw new Error("Unable to load step " + stepSummary.stepNumber);
    const archive = await loadQuestGuideStepArchive(guideId, stepSummary.stepNumber, values.input);
    if (archive === null) throw new Error("Missing quest summary file for step " + stepSummary.stepNumber);
    const questByKey = new Map(step.quests.map((quest) => [quest.questKey, quest]));
    for (const summary of archive.summaries) {
      const quest = questByKey.get(summary.questKey);
      if (quest === undefined) throw new Error("Step " + step.stepNumber + " summarizes an unrelated quest: " + summary.questKey);
      if (quest.externalUrl !== null && new URL(quest.externalUrl).pathname !== new URL(summary.sourceUrl).pathname) {
        throw new Error("Step " + step.stepNumber + " has a source mismatch for " + summary.questKey);
      }
    }
    const summarizedKeys = new Set(archive.summaries.map((summary) => summary.questKey));
    const expectedKeys = new Set(step.quests.flatMap((quest) => quest.externalUrl === null ? [] : [quest.questKey]));
    missingSummaryCount += [...expectedKeys].filter((questKey) => !summarizedKeys.has(questKey)).length;
    summaryCount += archive.summaries.length;
    tipCount += archive.tips.length;
  }
  console.info("[summary validation] " + steps.length + " step files valid");
  console.info("[summary validation] " + summaryCount + " summaries · " + tipCount + " multi-quest tips · " + missingSummaryCount + " tutorials remaining");
} finally {
  repository.close();
}
