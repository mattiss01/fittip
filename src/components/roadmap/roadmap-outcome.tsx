"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";

/**
 * Where a successful roadmap write says what it did.
 *
 * Every control on this surface is removed by the write it performs: a
 * generation replaces the compose form with the proposal it produced,
 * acceptance and decline remove the review the buttons sat in, and an edit
 * replaces the open proposal under the dock. A sentence returned to the control
 * that submitted would therefore be unmounted before anybody could read it,
 * which is why the four approved success wordings went missing when each island
 * kept its own reply.
 *
 * So the outcome is held beside React, in this module, and reported the moment
 * the server answers — before the tree that removes the control commits. This
 * component is rendered once by `RoadmapScreen`, at a stable position, so the
 * revalidated tree reconciles onto the same instance and it survives every
 * write. A refusal is deliberately *not* routed here: that belongs next to the
 * control the owner has to act on, and it is rendered there.
 *
 * The module-level value is browser state, never request state. It is written
 * only from a submit that has already reached the browser, and
 * `getServerSnapshot` reports nothing, so server rendering never reads it and
 * hydration cannot mismatch.
 */

/** The statuses that mean the write landed. Only these are reported here. */
const LANDED = new Set(["proposal", "accepted", "declined", "edited"]);

let outcome: RoadmapActionState | null = null;
const listeners = new Set<() => void>();

/**
 * Called with the reply as soon as it arrives, and with `null` when a new write
 * begins. A reply that is not a landed write clears the notice instead of
 * replacing it, because the refusal is rendered in place.
 */
export function reportRoadmapOutcome(state: RoadmapActionState | null) {
  const next = state !== null && LANDED.has(state.status) ? state : null;
  if (next === outcome) return;
  outcome = next;
  for (const listener of listeners) listener();
}

export function RoadmapOutcomeNotice() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Leaving the roadmap ends the sentence's life. Without this, a client-side
  // return to this route would reopen it with "Accepted. This is your roadmap
  // now." over a write the owner made minutes ago.
  useEffect(() => () => reportRoadmapOutcome(null), []);

  if (state === null) return null;
  return (
    <p
      className={styles.notice}
      data-roadmap-notice={state.status}
      data-roadmap-outcome
      role="status"
    >
      {state.message}
    </p>
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RoadmapActionState | null {
  return outcome;
}

function getServerSnapshot(): RoadmapActionState | null {
  return null;
}
