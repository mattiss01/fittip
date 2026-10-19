import { COACH_START_MAX_DAYS_AHEAD } from "@/lib/date/local-date";

/**
 * Every plan-proposal wording, in the one module a Client Component may import.
 *
 * Same arrangement, and the same reason, as `ROADMAP_CONTROL_COPY`: the review
 * dock holds state, so it is a Client Component, and `@/server/**` is refused by
 * the client import boundary in `src/architecture/server-boundary.test.ts`. So
 * the strings live here, no control's label is written inside a component, and
 * nothing is serialized into the client payload as props on every render.
 *
 * One wording is worth reading twice.
 *
 * The **example** label rests on the stored `provider_code`, never on `origin`.
 * A proposal the built-in fixture coach wrote is an example, and it says so
 * everywhere it appears, because it is written into permanent history exactly
 * like a real one.
 */
export const PLAN_PROPOSAL_COPY = {
  // The name the Plan's own button gives the page (R3).
  routeTitle: "Plan with Coach",

  /* ---- Compose -----------------------------------------------------------
     The owner cut the intro and every helper line on 2 Oct 2026: the form is
     two fields and a button. What stays is `generateSupport`, the one line
     that says nothing reaches the plan before the review is finished. */
  composeTitle: "Ask for a proposal",
  startDateLabel: "First day",
  startDateRange: `Between today and ${COACH_START_MAX_DAYS_AHEAD} days from now.`,
  dayCountLabel: "Days to plan",
  /* What is already on the chosen days. Open to the coach unless locked
     (owner, 19 Oct 2026; ADR-033), for this request only. */
  plannedHeading: "Already planned on these days",
  plannedSupport:
    "The coach may change or cancel any session you don't lock. Nothing changes until you accept it.",
  plannedNone: "Nothing is planned on these days yet.",
  lockLabel: "Lock",
  lockedLabel: "Locked",
  lockLabelFor: (title: string) => `Lock ${title}`,
  planningNoteLabel: "Anything the coach should account for? (optional)",
  generateAction: "Ask the coach",
  generateSupport: "Nothing enters your plan until you finish the review.",
  pending:
    "Building your proposal… Your plan stays exactly as it is until you finish reviewing.",

  /* ---- Review ------------------------------------------------------------ */
  reviewTitle: "What the coach proposed",
  coachNoteLabel: "The coach's note",
  /** A proposal with no sessions: the coach left these days as they were. */
  nothingAdded:
    "The coach added no session to these days. Its reason is below.",
  coachReasoningHeading: "Why this shape",
  assumptionsHeading: "What it assumed",
  uncertaintiesHeading: "What it was unsure about",
  safetyHeading: "Worth being careful about",
  /** The folded part of the coach's note: its assumptions and doubts. */
  coachMoreSummary: "What the coach assumed and was unsure about",
  alternativesHeading: "Instead of this, if you need to",
  whyItMattersLabel: "Why it matters:",
  whatToWatchLabel: "Watch for:",
  rationaleLabel: "Why this session:",

  alreadyPlannedBadge: "Already planned",
  alreadyPlannedSupport:
    "This is already on your plan. The coach knew about it and did not re-propose it, and nothing here changes it unless you do.",

  /* ---- Editing a planned session inside review --------------------------- */
  editPlannedAction: "Edit",
  editPlannedSave: "Save session",
  editPlannedSupport:
    "Saved to your plan straight away. Your choices above are kept.",
  /**
   * The same consequence the plan surface states for the "Only this session"
   * scope. Review offers no scope choice, so the one it takes has to be named:
   * an owner who thought they were changing the series would be wrong, and
   * nothing else on this screen would tell them.
   */
  editPlannedSeriesConsequence:
    "This repeats. Saving changes this occurrence only — it becomes visibly changed and the recurring rule never overwrites it.",
  /**
   * Cancelling one of the owner's own sessions from inside the review (owner,
   * 17 Oct 2026): how a coach session proposed beside it can take its place
   * when it was not ticked "can be replaced". Like Edit, outside the proposal.
   */
  cancelPlannedAction: "Cancel session",
  cancelPlannedConsequence:
    "Cancelled on your plan straight away, not as part of this proposal. It stays on the record as cancelled, and you can reactivate it from the Plan.",
  cancelPlannedSeriesConsequence:
    "This repeats. Only this day is cancelled; the rest stays as it is.",
  cancelPlannedSubmit: "Cancel this session",

  /* ---- Staleness --------------------------------------------------------- */
  /**
   * Non-blocking, and specific about what is already true. The timeline is
   * re-read on every render, so by the time this is on screen the refresh has
   * happened — saying "reload" would be telling the owner to do something the
   * page did for them.
   */
  planChangedNotice:
    "Your plan has changed since the coach saw it — including anything you have just edited here. The days below are up to date, and finishing checks your plan again before adding anything.",
  /**
   * Shown in place of the editor on a day that has fallen behind owner-local
   * today. The plan's own write refuses a date outside its thirteen-week window,
   * so the controls are withheld and the reason is given, rather than offering
   * a button whose failure message would explain nothing.
   */
  plannedPastDay:
    "This day has passed, so it can no longer be edited here. It stays on the timeline because the coach planned around it.",
  proposedBadge: "Proposed",
  stagedBadge: "Will be added",
  replaceBadge: "Will replace",
  /* On the owner's own session, in place of "Already planned". */
  mayBeReplacedBadge: "May be replaced",
  willBeReplacedBadge: "Will be replaced",
  mayBeCancelledBadge: "May be cancelled",
  willBeCancelledBadge: "Will be cancelled",
  keptBadge: "Kept",
  besideBadge: "Will be added beside",
  rejectedBadge: "Rejected",
  cancelledBadge: "Cancelled",
  recoveryDayAlreadyBadge: "Already a recovery day",

  stageAction: "Add to plan",
  /* A proposed session that stands in for one the owner left open (9 and
     19 Oct 2026). Replace swaps the two when the review is finished, and the
     owner's session stays on the plan as cancelled; Add beside keeps it. */
  replaceAction: "Replace",
  besideAction: "Add beside",
  replaceActionFor: (title: string, old: string) =>
    `Replace ${old} with ${title}`,
  besideActionFor: (title: string, old: string) => `Add ${title} beside ${old}`,
  replacesLabel: "Replaces:",
  replaceUnavailable: (old: string | null) =>
    old === null
      ? "The session this would have replaced is no longer on your plan. Adding it adds it on its own."
      : `It can no longer replace ${old}, which has been logged or cancelled since. Adding it keeps ${old}.`,
  plannedMayBeReplaced: (title: string) =>
    `The coach suggests ${title} in its place.`,
  plannedWillBeReplaced: (title: string) =>
    `${title} takes its place when you finish the review. This one stays on your plan as cancelled, so you can bring it back.`,
  /* A planned session the coach suggests calling off (ADR-033). */
  cancelItemTitle: (title: string) => `Cancel ${title}`,
  cancelReasonLabel: "Why:",
  cancelItemAction: "Cancel it",
  keepItemAction: "Keep it",
  cancelItemActionFor: (title: string) => `Cancel ${title}`,
  keepItemActionFor: (title: string) => `Keep ${title}`,
  cancelUnavailable: (title: string | null) =>
    title === null
      ? "That session is no longer on your plan, so there is nothing to cancel."
      : `${title} has been logged or cancelled since, so there is nothing to cancel.`,
  plannedMayBeCancelled: "The coach suggests cancelling this one.",
  plannedWillBeCancelled:
    "Cancelled when you finish the review. You can bring it back from the Plan.",
  rejectAction: "Reject",
  resetAction: "Undecided",
  stageActionFor: (title: string) => `Add ${title} to plan`,
  rejectActionFor: (title: string) => `Reject ${title}`,
  resetActionFor: (title: string) => `Leave ${title} undecided`,

  /* ---- Finishing --------------------------------------------------------- */
  finishAction: "Finish review",
  finishSupport: (staged: number) =>
    staged === 0
      ? "Nothing is staged, so finishing will close this proposal without changing your plan."
      : staged === 1
        ? "One change will be made to your plan."
        : `${staged} changes will be made to your plan, all at once.`,
  unresolvedSupport: (unresolved: number) =>
    unresolved === 1
      ? "One item still needs a choice."
      : `${unresolved} items still need a choice.`,
  discardAction: "Discard proposal",
  discardSupport: "Nothing is added to your plan, and the proposal is kept.",
  discardConfirmTitle: "Discard this proposal?",
  discardConfirm: (staged: number) =>
    staged === 0
      ? "Nothing is added to your plan, and the proposal is gone from this page."
      : staged === 1
        ? "The one item you chose to add will not be added, and the proposal is gone from this page."
        : `The ${staged} items you chose to add will not be added, and the proposal is gone from this page.`,
  discardConfirmAction: "Discard proposal",
  discardCancel: "Keep reviewing",

  /* ---- Provenance -------------------------------------------------------- */
  exampleBadge: "Example",
  exampleSupport:
    "No coaching provider is configured, so this was written by the built-in example coach. It is a real record and a real plan change; it is not real coaching.",

  /* ---- Outcomes ---------------------------------------------------------- */
  outcomes: {
    regenerated:
      "Asked again. What you added to your plan is in it now, and the rest was dropped.",
    /* Said before anything is closed, so the proposal is still there. */
    regenerationTooLarge:
      "This proposal is too large to send back to the coach with your feedback. Finish or discard it, then ask for a new plan.",
    /**
     * The coach did not answer. Nothing was closed or applied (owner, 17 Oct
     * 2026): the proposal and the owner's choices on it are as they were.
     */
    regenerationLost:
      "The coach could not answer. This proposal and your choices are still here, so you can ask again.",
    /* Said before anything is asked, so the proposal is still there. */
    regenerationPastKept:
      "A day you added has already passed, so it can no longer go into your plan. Change that choice, or finish this proposal, then ask again.",
    regenerationCap:
      "This plan has been asked again as many times as it can be. Finish or discard this proposal, then ask for a fresh plan.",
    proposalReady: "Your proposal is ready. Decide each day below.",
    generationPending:
      "A proposal is already being built. This did not ask for a second one.",
    generationFailed:
      "The coach could not answer. Nothing was written, and you can ask again.",
    /* Two sources the owner curates and can shorten, so they are named
       (ADR-023). Any other oversize stays the general failure above. */
    goalsTooLarge:
      "Your active goals are too much to send in one request. Pause a few, or shorten their desired outcomes or the sports they name, then try again.",
    trainingSetupTooLarge:
      "Your training setup is too much to send in one request. Shorten the places, the equipment or the availability note in Settings, then try again.",
    /**
     * Not a failure. The plan operation requires an active goal and a confirmed
     * zone, and that is checked before any key is claimed or anything reserved —
     * so this refusal costs nothing and names what to do about it.
     */
    needsGoal:
      "Add an active goal before asking for a plan. The coach needs something to aim at, and nothing was written.",
    needsGoalAndTimezone:
      "Add an active goal and confirm your time zone before asking for a plan. Nothing was written.",
    itemDecided: "Choice saved.",
    discarded: "Proposal discarded. Your plan is unchanged.",
    unresolved: "Every proposed item needs a choice before you can finish.",
    alreadyFinished:
      "This review is already finished. Reload to see where it left your plan.",
    conflict:
      "Your plan changed while you were reviewing. Reload and decide again — nothing was added.",
    pastDate:
      "Part of this proposal is now in the past. Reload and ask for a fresh one; nothing was added.",
    dailyLimit:
      "One of those days would hold more than ten sessions. Nothing was added.",
    timezoneRequired:
      "Confirm your time zone on the plan before applying a proposal.",
    notAvailable: "That proposal is no longer available.",
    validation: "Check what you asked for and try again.",
    session: "Your session ended. Sign in again.",
    error: "Something went wrong. Nothing was added to your plan.",
  },

  /* ---- Memory candidates -------------------------------------------------- */
  //
  // The plan route's own wording, deliberately close to the roadmap's: the same
  // thing is waiting in the same place, and two phrasings for one idea would
  // read as two different things. What differs is only where it came from.
  memoryPanelTitle: "Suggested from your planning note",
  memoryCandidatesWaiting: (count: number) =>
    count === 1
      ? "1 item from a planning note is waiting for you. It is not used for coaching until you accept it."
      : `${count} items from a planning note are waiting for you. They are not used for coaching until you accept them.`,
  memoryReviewLink: "Review them in memory",
  /**
   * The pointer shown above the timeline. Deliberately not the panel's own
   * sentence: repeating it word for word would read as the same message twice
   * rather than as a signpost to one further down.
   */
  memoryCandidatesJump: (count: number) =>
    count === 1
      ? "1 item from your planning note is waiting below."
      : `${count} items from your planning note are waiting below.`,
  memoryJumpLink: "Jump to it",

  /* ---- Regeneration -------------------------------------------------------- */
  regenerateHeading: "Not what you wanted?",
  regenerateLabel: "What should be different?",
  /** Under the field, as the owner types (owner, 19 Oct 2026). */
  regenerateCount: (length: number, max: number) => `${length}/${max}`,
  regenerateSubmit: "Ask for a different plan",
  regenerateOpen: "Ask for a different plan",
  regenerateCancel: "Never mind",
  regeneratePending:
    "Asking the coach again… This proposal stays until the new one arrives.",
  /** Shown above a regenerated proposal, so the owner can judge the answer. */
  regeneratedFrom: (feedback: string) => `You asked for: ${feedback}`,

  /* ---- No goals ----------------------------------------------------------
     Asking without an active goal is refused, so the button opens a sheet with
     the way to Goals instead of asking. A notice used to promise a
     "deliberately general" proposal above a button that then refused, with
     the refusal below the fold (owner, 2 Oct 2026). */
  noGoalsTitle: "Add a goal first",
  noGoalsNotice:
    "The coach plans toward your goals, and you have no active one.",
  noGoalsLink: "Go to Goals",
  noGoalsCancel: "Cancel",
} as const;

export const PLAN_PROPOSAL_NOTE_MAX_LENGTH = 1000;

/**
 * The "ask again" field's limit, for the browser. The server's own is
 * `REGENERATION_FEEDBACK_MAX_LENGTH`, which a client component may not import;
 * `proposal-review.test.tsx` holds the two equal.
 */
export const PLAN_PROPOSAL_FEEDBACK_MAX_LENGTH = 500;
export const PLAN_PROPOSAL_MIN_DAYS = 1;
export const PLAN_PROPOSAL_MAX_DAYS = 7;
export const PLAN_PROPOSAL_DEFAULT_DAYS = 7;
