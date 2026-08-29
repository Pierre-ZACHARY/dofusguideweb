import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function CopyableItemName({
  name,
  className,
  children,
}: Readonly<{
  name: string;
  className?: string;
  children?: ReactNode;
}>) {
  const itemName = name.trim();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(itemName);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      className={className}
      title={copied ? `${itemName} copié` : `Copier ${itemName}`}
      aria-label={copied ? `${itemName} copié` : `Copier ${itemName}`}
      onClick={() => void copy()}
    >
      {children ?? itemName}
      {copied ? <Check className="shrink-0" size={13} aria-hidden="true" /> : <Copy className="shrink-0 opacity-55" size={13} aria-hidden="true" />}
    </button>
  );
}
