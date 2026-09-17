"use client";

import { useRef, useState } from "react";

import {
  INITIAL_ROADMAP_ACTION_STATE,
  type RoadmapActionState,
  type RoadmapActionStatus,
} from "@/app/home/plan/roadmap/action-state";

/**
 * How every roadmap write is submitted: await the action, then either reload
 * the document or say why it was refused.
 *
 * ## Why not a form action, a transition, or a redirect
 *
 * All three were tried against the 390px browser flow, and the trace is the
 * record. The server was correct every time: each write committed, and a
 * same-route redirect came back `303` with `x-action-redirect:
 * /home/plan/roadmap;push`. What failed was the client applying the result. The
 * first same-route redirect after a document load landed; the next one did not,
 * and left the submitting control disabled with its submission pending
 * indefinitely — whether the write was a generation, an edit or a regeneration,
 * whether the hook sat beside the form or above it, and whether or not the
 * previous navigation had settled. A reload showed the correct state at once,
 * every time.
 *
 * Two things were proven to work, so this does exactly those two. The action is
 * awaited directly from the submit handler, outside any transition, which
 * resolves as soon as the server answers. A write that succeeded then loads the
 * document again, which cannot be served a stale tree or left mid-transition.
 * The cost is a full load after each write — on a route that is dynamic, private
 * and read in one owner-scoped pass anyway — and the benefit is that what the
 * owner reads after a write is what the database holds, which is the one thing
 * this surface cannot get wrong.
 *
 * A refusal is rendered in place, with whatever the owner typed still there,
 * because that is the case they have to act on.
 */

/** The statuses that mean the write landed and the screen is now out of date. */
const WRITE_LANDED: ReadonlySet<RoadmapActionStatus> = new Set([
  "proposal",
  "accepted",
  "declined",
  "edited",
]);

export type RoadmapWrite = {
  saving: boolean;
  /** The last refusal, or null. Never set for a write that landed. */
  refused: RoadmapActionState | null;
  submit: (formData: FormData) => Promise<void>;
};

export function useRoadmapWrite(
  action: (
    previous: RoadmapActionState,
    formData: FormData,
  ) => Promise<RoadmapActionState>,
  /** The copy shown when the call itself fails, e.g. a dropped connection. */
  unreachable: string,
): RoadmapWrite {
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<RoadmapActionState | null>(null);
  // The last reply, so the action can number its submission. Held in a ref
  // because nothing renders from it.
  const previous = useRef(INITIAL_ROADMAP_ACTION_STATE);

  async function submit(formData: FormData) {
    if (saving) return;
    setSaving(true);
    let result: RoadmapActionState;
    try {
      result = await action(previous.current, formData);
    } catch {
      result = {
        status: "error",
        message: unreachable,
        submission: previous.current.submission + 1,
      };
    }
    previous.current = result;

    if (WRITE_LANDED.has(result.status)) {
      // Left `saving`: the control stays disabled until the new document
      // replaces this one, so a second press cannot start a second write.
      globalThis.location.assign("/home/plan/roadmap");
      return;
    }
    setRefused(result);
    setSaving(false);
  }

  return { saving, refused, submit };
}
