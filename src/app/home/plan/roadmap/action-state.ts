/**
 * What a roadmap Server Action returns, and what the surface renders from it.
 *
 * It lives apart from `actions.ts` because a `use server` module may export
 * nothing but async functions, and the client components need the type and the
 * initial value. Nothing here imports `@/server/**`, so a Client Component may
 * import it.
 */

export type RoadmapActionStatus =
  /** Nothing has been submitted yet. */
  | "idle"
  /** A proposal was generated and is waiting below. */
  | "proposal"
  /** An attempt under this key is already running; no second call was made. */
  | "pending"
  | "accepted"
  | "declined"
  | "edited"
  /** A roadmap written by hand is in force (ADR-029). */
  | "written"
  /** The roadmap in force was edited by hand, in force at once (ADR-030). */
  | "rewritten"
  /** A milestone was marked reached, or its mark taken back. */
  | "marked"
  /** A due review was marked reviewed. */
  | "reviewed"
  /** The owner's input is wrong and nothing was written. */
  | "validation"
  /** Something changed underneath; the owner must look again. */
  | "conflict"
  /** The three regenerations for this horizon are used up. */
  | "cap-reached"
  /** The session ended. */
  | "session"
  | "error";

export type RoadmapActionDraft = {
  startDate: string;
  endDate: string;
  planningNote: string;
  regenerationFeedback: string;
};

export type RoadmapActionState = {
  status: RoadmapActionStatus;
  message: string;
  /**
   * Increments once per submission, so a reply can be told apart from the one
   * before it even when both carry the same status and message.
   */
  submission: number;
  /**
   * Returned on a rejected compose so the form keeps what was typed.
   *
   * A form action resets an uncontrolled form when its reply commits, so the
   * two counted fields are re-seeded from this rather than left blank under a
   * refusal the owner has to act on.
   */
  draft?: RoadmapActionDraft;
  /**
   * Set when the coach was asked under this key and the attempt has ended
   * without a proposal. The form then asks again under a new key: the old one
   * would only replay the failure (owner's first live test, 17 Oct 2026).
   * Never set past a deadline, where the call may still be running, nor on a
   * replay of such an attempt, so a resend there stays a replay until reload.
   */
  attemptEnded?: true;
};

export const INITIAL_ROADMAP_ACTION_STATE: RoadmapActionState = {
  status: "idle",
  message: "",
  submission: 0,
};

/** ADR-014 decision 1 and decision 6, mirrored for the two text inputs. */
export const ROADMAP_NOTE_MAX_LENGTH = 1000;
export const ROADMAP_FEEDBACK_MAX_LENGTH = 500;
