import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ClientPortal({ children }: Readonly<{ children: ReactNode }>) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.body);
  }, []);

  return container === null ? null : createPortal(children, container);
}
