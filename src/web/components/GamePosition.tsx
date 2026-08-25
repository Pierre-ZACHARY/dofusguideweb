import { CoordinateCopy } from "./CopyableCoordinates.js";

export interface GamePositionValue { map?: string | null; position?: string | null; cmd?: string | null; x?: number | null; y?: number | null }

export function GamePosition({
  position,
  compact = false,
  label,
  showMap = true,
}: Readonly<{ position: GamePositionValue; compact?: boolean; label?: string; showMap?: boolean }>) {
  const coordinates = position.position ?? (position.x !== null && position.x !== undefined && position.y !== null && position.y !== undefined ? `[${position.x},${position.y}]` : null);
  const match = coordinates?.match(/^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/u);

  return (
    <div className={"flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm " + (compact ? "justify-center" : "")}>
      {label && <span className="font-medium text-base-content/65">{label}</span>}
      {match ? <CoordinateCopy x={Number(match[1])} y={Number(match[2])} /> : coordinates}
      {showMap && position.map && !compact && <span className="basis-full text-xs font-medium uppercase tracking-wide text-base-content/45">{position.map}</span>}
    </div>
  );
}
