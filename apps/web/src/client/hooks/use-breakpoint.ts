import { useEffect, useState } from "react";

type Breakpoint = "sm" | "md" | "lg";

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "lg";
  const width = window.innerWidth;
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  return "sm";
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    const handleResize = () => {
      setBreakpoint(getBreakpoint());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return breakpoint;
}
