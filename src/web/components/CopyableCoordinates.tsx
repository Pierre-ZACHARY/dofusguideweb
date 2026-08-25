import { useState, type ReactNode } from "react";

const COORDINATE_PATTERN = /\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/gu;

export function CoordinateCopy({ x, y, className = "" }: Readonly<{ x: number; y: number; className?: string }>) {
  const [copied, setCopied] = useState(false);
  const label = "[" + x + "," + y + "]";

  async function copy() {
    await navigator.clipboard.writeText("/travel " + x + "," + y);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button
        type="button"
        className={"coordinate-link cursor-pointer border-0 bg-transparent p-0 font-extrabold tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " + className}
        onClick={copy}
        aria-label={"Copier la commande /travel " + x + "," + y}
        title={"Copier /travel " + x + "," + y}
      >
        {label}
      </button>
      {copied && <div className="toast toast-end z-50"><div className="alert alert-success py-2"><span>Commande /travel copiée</span></div></div>}
    </>
  );
}

export function CopyableCoordinates({ text }: Readonly<{ text: string }>) {
  const matches = [...text.matchAll(COORDINATE_PATTERN)];
  if (matches.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(<CoordinateCopy key={match.index + ":" + match[0]} x={Number(match[1])} y={Number(match[2])} />);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
