import { SqliteDofusGuideRepository } from "../repositories/sqliteDofusGuideRepository.js";
import type { SearchQuestOptions } from "../repositories/contracts.js";

export type {
  GuideChapterRecord,
  GuideElementRecord,
  GuideRecord,
  GuideStepRecord,
  GuideStepSummaryRecord,
  PaginatedQuests,
  QuestRecord,
  QuestStepRecord,
  SearchQuestOptions,
  StepQuestRecord,
} from "../repositories/contracts.js";

export class QueryService extends SqliteDofusGuideRepository {
  override searchQuests(options: SearchQuestOptions = {}) {
    return super.searchQuests(options);
  }
}
