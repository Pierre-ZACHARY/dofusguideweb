import { Lightbulb, ListChecks } from "lucide-react";
import type { QuestGuideStepTipDto, StepQuestDto } from "../data/models.js";

export function QuestStepTips({ tips, quests }: Readonly<{ tips: QuestGuideStepTipDto[]; quests: StepQuestDto[] }>) {
  if (tips.length === 0) return null;
  const questNames = new Map(quests.map((quest) => [quest.questKey, quest.originalName ?? quest.questKey]));
  return (
    <div className="mb-4 space-y-3" aria-label="Conseils pour combiner les quêtes">
      {tips.map((tip) => (
        <aside className="rounded-box border border-info/35 bg-info/10 p-4" key={tip.title + ":" + tip.questKeys.join(":")}>
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 shrink-0 text-info" size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="font-bold">{tip.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-base-content/80">{tip.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tip.questKeys.map((questKey) => <span className="badge badge-info badge-outline h-auto whitespace-normal py-1" key={questKey}>{questNames.get(questKey) ?? questKey}</span>)}
              </div>
              {tip.actions.length > 0 && (
                <ul className="space-y-1.5 text-sm text-base-content/80">
                  {tip.actions.map((action) => <li className="flex items-start gap-2" key={action}><ListChecks className="mt-0.5 shrink-0 text-info" size={15} aria-hidden="true" /><span>{action}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        </aside>
      ))}
    </div>
  );
}
