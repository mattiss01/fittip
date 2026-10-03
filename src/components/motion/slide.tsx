import * as React from "react";
import type { ReactNode } from "react";

/**
 * R4 motion (owner, 3 Oct 2026): a day on Today and a week on the Plan slide
 * in from the side they lie on. globals.css draws the slide for the two
 * classes named here; reduced motion turns it off there.
 *
 * Read through the namespace rather than imported by name: the React that
 * Next.js bundles has `ViewTransition` and `addTransitionType`, the plain
 * `react` package the unit tests run against does not. Without them the
 * content renders as it is and the direction is not recorded, which is the
 * behaviour of a browser without view transitions anyway.
 */
const SLIDE = {
  "slide-forward": "slide-forward",
  "slide-back": "slide-back",
  default: "none",
};

export type SlideDirection = "slide-forward" | "slide-back";

/** Content that slides when the `key` it is given changes. */
export function Slide({ children }: { children: ReactNode }) {
  // `in` first: a test's mocked React throws on a read of a missing export.
  const Transition =
    "ViewTransition" in React ? React.ViewTransition : undefined;
  if (Transition === undefined) return <>{children}</>;
  return (
    <Transition enter={SLIDE} exit={SLIDE} default="none">
      {children}
    </Transition>
  );
}

/** Names the direction of the transition being started, if React can. */
export function markSlide(direction: SlideDirection) {
  if ("addTransitionType" in React) React.addTransitionType(direction);
}

/** Later dates come in from the right, earlier ones from the left. */
export function slideTowards(
  from: string,
  to: string,
): SlideDirection[] | undefined {
  if (to === from) return undefined;
  return [to > from ? "slide-forward" : "slide-back"];
}
