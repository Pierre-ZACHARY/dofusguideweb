import { Fragment, type ReactNode } from "react";

export type DofusMarkupNode =
  | { type: "text"; value: string }
  | { type: "color"; color: string; children: DofusMarkupNode[] };

const tokenPattern = /<\/?fc(?:=([^>]*))?>/giu;

function safeColor(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  return parts.length === 3 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? `rgb(${parts.join(", ")})`
    : null;
}

export function parseDofusMarkup(value: string): DofusMarkupNode[] {
  const root: DofusMarkupNode[] = [];
  const stack: Array<DofusMarkupNode[]> = [root];
  let cursor = 0;
  for (const match of value.matchAll(tokenPattern)) {
    const index = match.index;
    const current = stack.at(-1)!;
    if (index > cursor) current.push({ type: "text", value: value.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      else current.push({ type: "text", value: token });
    } else {
      const color = safeColor(match[1]);
      if (color === null) current.push({ type: "text", value: token });
      else {
        const node: DofusMarkupNode = { type: "color", color, children: [] };
        current.push(node);
        stack.push(node.children);
      }
    }
    cursor = index + token.length;
  }
  stack.at(-1)!.push({ type: "text", value: value.slice(cursor) });
  return root;
}

function renderNodes(nodes: DofusMarkupNode[]): ReactNode {
  return nodes.map((node, index) => node.type === "text"
    ? <Fragment key={index}>{node.value}</Fragment>
    : <span key={index} style={{ color: node.color }}>{renderNodes(node.children)}</span>);
}

export function DofusMarkup({ value }: Readonly<{ value: string }>) {
  return <>{renderNodes(parseDofusMarkup(value))}</>;
}
