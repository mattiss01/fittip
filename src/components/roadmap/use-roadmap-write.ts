"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { reportRoadmapOutcome } from "./roadmap-outcome";

import {
  INITIAL_ROADMAP_ACTION_STATE,
  type RoadmapActionState,
} from "@/app/home/plan/roadmap/action-state";
import {
  actionResponseTimes,
  RECOVERY_NOTICE_MS,
  replyForWrite,
  watchTransition,
  WATCH_INTERVAL_MS,
} from "@/lib/app-router/transition-watchdog";

/**
 * How every roadmap write is submitted: a form action, watched.
 *
 * The normal path is the ordinary one. The action's own reply carries both the
 * typed result and the revalidated tree, so a write that lands renders its
 * approved sentence over the screen it produced, with the owner's scroll
 * position and focus where they left them. Nothing here loads the document on
 * a success.
 *
 * ## The defect this exists for, and why it is not a redirect or a reload
 *
 * That transition intermittently never commits. Measured on this surface
 * before M3-11 — three of six compose runs left the screen on "Building your
 * roadmap proposal…" for ever while the server had already answered 200 with
 * the complete proposal — and seen again in M3-15F's own browser flow, on
 * every calling convention tried: a transition-wrapped call, a form action, and
 * a same-route redirect that the trace shows the server answering `303` with
 * `x-action-redirect: /home/plan/roadmap;push`. In every case the write
 * committed and a reload showed the right state at once.
 *
 * The cause is upstream and is documented in
 * `@/lib/app-router/transition-watchdog`: React's `useDeferredValue` can stick
 * on a stale value (facebook/react#35821), and `layout-router` routes every
 * segment's payload through it. Three other surfaces — goals, memory and the
 * plan's recurrence writes — answer it the same way, by watching the mutation
 * from outside React and reloading the one case that gets stuck. Reloading
 * after *every* write would pay that cost on the ninety-odd per cent of
 * submissions that render correctly, and it would throw away the reply — which
 * is why the four approved success sentences went missing when it was tried.
 *
 * ## What the watch may claim
 *
 * Only the "a reply arrived and never rendered" half of `watchTransition` is
 * taken. Its ten-second confirmation budget belongs to a form save; a roadmap
 * generation is one provider call and has no honest fixed deadline, so a
 * silent request keeps waiting behind the pending copy rather than being
 * declared unconfirmed while it is still legitimately running.
 *
 * And a resource-timing entry proves only that a response arrived, never what
 * it said: these actions answer 200 for a conflict, a validation failure and an
 * expired session too. So the notice says the step did not appear and the page
 * is reloading. It never says anything was saved.
 */

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no roadmap content, only the fact that the reload
 * happened, so the reloaded page can explain itself.
 */
const RECOVERY_FLAG = "fittip.roadmap.recovered:v1";

/**
 * When each roadmap write in this document was submitted. Every roadmap write
 * posts to the one page address, so a response on the timeline cannot be told
 * apart from another write's: two milestones ticked within a second each saw
 * the other's reply as their own and reloaded the page for nothing. A write is
 * only judged lost once the page has had a reply for every write it sent.
 *
 * The replies are gathered here for the document, by every control's
 * observer, so a control that mounts later does not depend on the timeline's
 * buffer to replay them. Both are forgotten whenever no write is waiting, so
 * a long visit neither grows them nor carries an old miscount forward.
 */
const submittedInstants: number[] = [];

/**
 * How long a roadmap reply may take to render before it counts as lost
 * (owner, 21 Oct 2026: the reload notice showed after nearly every proposal).
 * A proposal is the first time its dock, sheets and suggestion cards appear in
 * the document, so their code is fetched before it can render; on the dev
 * server it is compiled first, which took longer than the shared 750 ms. A
 * genuinely stuck render still reloads, five seconds after its reply.
 */
const ROADMAP_RENDER_GRACE_MS = 5_000;
const replies = new Set<number>();
let waitingWrites = 0;

/** Forgets every write submitted so far; for tests, which share the module. */
export function forgetRoadmapWrites() {
  submittedInstants.length = 0;
  replies.clear();
  waitingWrites = 0;
}

export type RoadmapWrite = {
  /** The last reply, or the initial idle state. */
  state: RoadmapActionState;
  /** Pass to a form's `action`. */
  submit: (formData: FormData) => void;
  pending: boolean;
  /** A reply arrived for this submission and never rendered; a reload follows. */
  lostRender: boolean;
};

export function useRoadmapWrite(
  action: (
    previous: RoadmapActionState,
    formData: FormData,
  ) => Promise<RoadmapActionState>,
): RoadmapWrite {
  // When this write left the browser, on the clock the resource timeline uses.
  //
  // It is taken here rather than in the watch effect for two reasons, and both
  // of them are defects this surface has actually shown. The effect only runs
  // once the pending render commits, and a reply can beat that commit — a
  // baseline taken then would swallow the very response the watch exists to
  // catch. And the timeline belongs to the document, not to the control reading
  // it: `buffered: true` replays every earlier response to a control that
  // mounts after one, which on this surface is every control, because each is
  // removed by the write it performs. Anything that answered before this
  // instant is therefore some other write's, and treating it as this one's
  // declared the next write lost 250 ms after submit with nothing wrong.
  const submittedAt = useRef<number | null>(null);

  // The reply is reported to `roadmap-outcome` here, in the browser, the moment
  // the server answers — before React commits the tree that removes the control
  // this hook belongs to. Reporting it from a render or an effect instead would
  // lose every success sentence, because a landed write unmounts its own
  // control in the same commit that carries the reply.
  async function watched(
    previous: RoadmapActionState,
    formData: FormData,
  ): Promise<RoadmapActionState> {
    submittedAt.current = performance.now();
    submittedInstants.push(submittedAt.current);
    reportRoadmapOutcome(null);
    const result = await action(previous, formData);
    reportRoadmapOutcome(result);
    return result;
  }

  const [state, submit, pending] = useActionState(
    watched,
    INITIAL_ROADMAP_ACTION_STATE,
  );
  const lostRender = useLostRenderRecovery(
    pending,
    state.submission,
    submittedAt,
  );
  return { state, submit, pending, lostRender };
}

/** The statuses a control renders itself: a landed write says so elsewhere. */
export function isRefusal(state: RoadmapActionState): boolean {
  return (
    state.status !== "idle" &&
    state.status !== "proposal" &&
    state.status !== "accepted" &&
    state.status !== "declined" &&
    state.status !== "edited" &&
    state.status !== "written" &&
    state.status !== "deleted" &&
    state.status !== "marked" &&
    state.status !== "reviewed"
  );
}

function useLostRenderRecovery(
  pending: boolean,
  submission: number,
  /** The instant the write in flight was submitted; see `useRoadmapWrite`. */
  submittedAt: RefObject<number | null>,
): boolean {
  // Keyed by the submission it describes, so a later write never inherits an
  // earlier one's verdict and no effect has to reset state.
  const [lostFor, setLostFor] = useState<string | null>(null);
  const key = `${submission}:${pending}`;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
    const observer = new PerformanceObserver((list) => {
      for (const seen of actionResponseTimes(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      )) {
        replies.add(seen);
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    // A new write supersedes any earlier recovery, so the explanation is
    // consumed here rather than in the render that would have shown it.
    // Clearing it during render would consume the marker in the same document
    // that set it, and the reloaded page would have nothing to explain itself
    // with.
    markRecovered(false);
    waitingWrites += 1;
    // The submit's own instant, not this effect's. Everything the resource
    // timeline held at that moment answered an earlier write, so it is
    // accounted for and cannot be read as this one's reply; everything after it
    // is this write's and is not.
    const startedAt = submittedAt.current ?? performance.now();
    let reload = 0;
    let reloading = false;
    const interval = window.setInterval(() => {
      // `unconfirmed` is deliberately ignored rather than acted on: this
      // surface takes the lost-render half alone, so a request that has simply
      // not answered yet keeps waiting.
      const verdict = watchTransition({
        submittedAt: startedAt,
        respondedAt: replyForWrite(submittedInstants, replies),
        consumedAt: startedAt,
        now: performance.now(),
        renderGraceMs: ROADMAP_RENDER_GRACE_MS,
      });
      if (verdict !== "lost-render") return;
      window.clearInterval(interval);
      setLostFor(key);
      markRecovered(true);
      reload = window.setTimeout(() => {
        reloading = true;
        window.location.reload();
      }, RECOVERY_NOTICE_MS);
    }, WATCH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      // Cleanup runs when this write settles or the surface unmounts, so a
      // queued reload is stale by then: the user has navigated away, or the
      // lost transition landed inside the notice window and the result is
      // already on screen.
      window.clearTimeout(reload);
      // And in that second case the marker has to go with it. It explains a
      // reload that then never happened, and the next control to mount with
      // nothing submitted would tell the owner this page was reloaded when it
      // was not. Only a reload that actually fired leaves it standing, and that
      // path replaces the document rather than running this cleanup.
      if (reload !== 0 && !reloading) markRecovered(false);
      waitingWrites -= 1;
      if (waitingWrites <= 0) {
        waitingWrites = 0;
        submittedInstants.length = 0;
        replies.clear();
      }
    };
  }, [key, pending, submittedAt]);

  return lostFor === key && pending;
}

/**
 * The recovery reload replaces the surface, so the message the write produced
 * is gone. Saying nothing would leave the reload looking like an unexplained
 * flash, so the reason is carried across it until the next write.
 *
 * `untouched` is the caller's own "nothing has been submitted in this
 * document", which is why this is a hook of its own rather than part of
 * `useRoadmapWrite`: the decision dock holds three writes and must still
 * explain the reload exactly once.
 */
export function useRoadmapRecovered(untouched: boolean): boolean {
  // The server has no session storage and reports "not recovered", and the
  // client agrees on the first render, so hydration cannot mismatch. The
  // marker is consumed by the next write, not here.
  const recovered = useSyncExternalStore(
    subscribeNothing,
    readRecovered,
    () => false,
  );
  return recovered && untouched;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch {
    // Session storage throws in private browsing and when it is disabled.
    return false;
  }
}

function markRecovered(recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}
