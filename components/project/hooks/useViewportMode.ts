"use client";

import { useEffect, useState } from "react";

export type ViewportMode = "pending" | "desktop" | "mobile";

const desktopQuery = "(min-width: 1024px)";

function readViewportMode(): ViewportMode {
  if (typeof window === "undefined") return "pending";
  return window.matchMedia(desktopQuery).matches ? "desktop" : "mobile";
}

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(readViewportMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(desktopQuery);
    const update = () => setMode(mediaQuery.matches ? "desktop" : "mobile");
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return mode;
}
