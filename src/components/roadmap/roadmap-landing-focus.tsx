"use client";

import { useEffect, useRef } from "react";

import { takeRoadmapLanding } from "./roadmap-compose-session";

/**
 * Moves focus to the first heading of the element it sits in, once, when what
 * that element shows has just landed from the "New roadmap" sheet. Drawn
 * nothing; on any other mount it does nothing.
 */
export function RoadmapLandingFocus() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!takeRoadmapLanding()) return;
    const heading =
      ref.current?.parentElement?.querySelector<HTMLElement>("h2, h3");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, []);
  return <span ref={ref} hidden />;
}
