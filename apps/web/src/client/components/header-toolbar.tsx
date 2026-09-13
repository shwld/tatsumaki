import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HeaderToolbarContext = createContext<
  HTMLDivElement | null | undefined
>(undefined);

export function HeaderToolbar({ children }: { children: ReactNode }) {
  const host = useContext(HeaderToolbarContext);
  if (host === undefined) return <>{children}</>;
  return host ? createPortal(children, host) : null;
}
