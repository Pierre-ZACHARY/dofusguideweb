import { useEffect, useState } from "react";

export function QuestAvatar({
  src,
  name,
  className = "h-10 w-10",
}: Readonly<{ src: string | null; name: string; className?: string }>) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={"avatar placeholder " + className}><div className="mask mask-squircle h-full w-full bg-primary text-primary-content"><span>{name.trim().charAt(0) || "?"}</span></div></div>;
  return <div className={"avatar " + className}><div className="mask mask-squircle h-full w-full bg-base-200"><img src={src} alt={"Portrait de " + name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-contain" /></div></div>;
}
