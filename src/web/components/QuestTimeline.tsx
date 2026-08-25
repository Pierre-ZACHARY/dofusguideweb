import { Link } from "@tanstack/react-router";
import type { QuestStepRecord } from "../../repositories/contracts.js";

export function QuestTimeline({ occurrences }: Readonly<{ occurrences: QuestStepRecord[] }>) {
  return <ul className="timeline timeline-vertical timeline-compact">{occurrences.map((occurrence, index) => <li key={`${occurrence.guideId}:${occurrence.stepNumber}:${occurrence.sortOrder}`}>
    {index > 0 && <hr className="bg-primary" />}
    <div className="timeline-middle"><span className={`status ${occurrence.relationType === "FINISH" ? "status-success" : occurrence.relationType === "START" ? "status-info" : "status-warning"}`} aria-label={occurrence.relationType} /></div>
    <div className="timeline-end timeline-box mb-5"><div className="badge badge-outline mb-2">{occurrence.relationType}</div><p className="font-semibold">Étape {occurrence.stepNumber}</p><p className="text-sm opacity-70">{occurrence.stepTitle}</p><Link className="link link-primary text-sm" to="/guides/$guideId/steps/$stepNumber" params={{ guideId: String(occurrence.guideId), stepNumber: String(occurrence.stepNumber) }}>Voir l’étape</Link></div>
    {index < occurrences.length - 1 && <hr className="bg-primary" />}
  </li>)}</ul>;
}
