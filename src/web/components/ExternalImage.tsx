import { ImageOff } from "lucide-react";
import { useState } from "react";

export function ExternalImage({ src, alt, className = "", hideOnError = false }: Readonly<{ src: string | null | undefined; alt: string; className?: string; hideOnError?: boolean }>) {
  const [failed, setFailed] = useState(false);
  if (hideOnError && (!src || failed)) return null;
  if (!src || failed) return <div className={`grid place-items-center bg-base-300 text-base-content/50 ${className}`} role="img" aria-label={`Image indisponible : ${alt}`}><ImageOff aria-hidden="true" /></div>;
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
