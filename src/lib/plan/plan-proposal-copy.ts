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
 * Two wordings are worth reading twice.
 *
 * The **recovery-day** strings are the surface's own, not the coach's. A
 * recovery-day item exists because the coach left a date empty, and it carries
 * no rationale, so these say what the proposal means by an empty day without
 * putting words in the coach's mouth.
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
  /* What is already on the chosen days (owner, 9 Oct 2026). Everything stays
     unless it is ticked. */
  plannedHeading: "Already planned on these days",
  plannedSupport:
    "Each stays in your plan unless you tick it. The coach may replace a ticked one.",
  plannedNone: "Nothing is planned on these days yet.",
  replaceableLabel: "Can be replaced",
  replaceableLabelFor: (title: string) => `${title} can be replaced`,
  planningNoteLabel: "Anything the coach should account for? (optional)",
  generateAction: "Ask the coach",
  generateSupport: "Nothing enters your plan until you finish the review.",
  pending:
    "Building your proposal… Your plan stays exactly as it is until you finish reviewing.",

  /* ---- Review ------------------------------------------------------------ */
  reviewTitle: "What the coach proposed",
  coachReasoningHeading: "Why this shape",
  assumptionsHeading: "What it assumed",
  uncertaintiesHeading: "What it was unsure about",
  safetyHeading: "Worth being careful about",
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
  roadmapHeading: "Planned under your roadmap",
  roadmapPlannedUnder: (title: string, versionNumber: number) =>
    `${title} — version ${versionNumber}, the roadmap you have accepted.`,
  /**
   * A roadmap accepted since the proposal was made. The proposal was planned
   * under the older version, so naming the current roadmap here would name the
   * wrong one, and the version number is the only honest thing left to say.
   */
  roadmapSuperseded: (versionNumber: number) =>
    `Version ${versionNumber}, which you have since replaced. This proposal was planned under the older roadmap.`,
  roadmapStaleOutOfWindow:
    "These days fall outside your roadmap's own dates, so it describes a different stretch of training.",
  roadmapStaleGoalMissing:
    "Your roadmap gives attention to a goal you no longer hold, so part of its direction no longer applies.",
  roadmapStaleLead: "Worth knowing:",
  proposedBadge: "Proposed",
  stagedBadge: "Will be added",
  replaceBadge: "Will replace",
  /* The last finished review, folded under the form (owner, 9 Oct 2026). Its
     tags say what happened, not what will. */
  addedBadge: "Added",
  lastReviewTitle: "Your last review",
  lastReviewSummary: (day: string, added: number, rejected: number) =>
    `Last review, ${day}: ${added} added, ${rejected} rejected`,
  /* On the owner's own session, in place of "Already planned". */
  canBeReplacedBadge: "Can be replaced",
  willBeReplacedBadge: "Will be replaced",
  besideBadge: "Will be added beside",
  rejectedBadge: "Rejected",
  cancelledBadge: "Cancelled",
  recoveryDayTitle: "Recovery day",
  recoveryDaySupport:
    "The coach put no session on this day. Accepting it marks the day as rest you meant to take, rather than a day you happened to leave empty.",
  recoveryDayAlreadyBadge: "Already a recovery day",

  stageAction: "Add to plan",
  /* A proposed session that stands in for one the owner marked "can be
     replaced" (9 Oct 2026). Replace swaps the two when the review is
     finished; Add beside keeps the owner's session. */
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
    `You said this can be replaced. ${title} would take its place.`,
  plannedWillBeReplaced: (title: string) =>
    `${title} takes its place when you finish the review.`,
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
        ? "One item will be added to your plan, in one change."
        : `${staged} items will be added to your plan, in one change.`,
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

  /**
   * Where the owner goes once a review is closed: back to the plan, where the
   * sessions they just added now sit among the ones they already had.
   */
  finishedPlanLink: "Back to plan",

  /* ---- Provenance -------------------------------------------------------- */
  exampleBadge: "Example",
  exampleSupport:
    "No coaching provider is configured, so this was written by the built-in example coach. It is a real record and a real plan change; it is not real coaching.",

  /* ---- Outcomes ---------------------------------------------------------- */
  outcomes: {
    regenerated:
      "Asked again. What you added to your plan stayed; the rest was dropped.",
    /**
     * Reached only after the review has been applied and the proposal closed,
     * so it must not say nothing was written. Both of those are true and
     * permanent by the time the coach fails to answer.
     */
    regenerationLost:
      "What you added is in your plan and the old proposal is closed, but the coach could not answer. Ask for a new plan above.",
    /** Appended to a conflict or rule message on that same path. */
    regenerationKept: "What you added is in your plan.",
    regenerationCap:
      "This plan has been asked again as many times as it can be. Ask for a fresh plan above.",
    proposalReady: "Your proposal is ready. Decide each day below.",
    generationPending:
      "A proposal is already being built. This did not ask for a second one.",
    generationFailed:
      "The coach could not answer. Nothing was written, and you can ask again.",
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
    applied: (applied: number) =>
      applied === 0
        ? "Review finished. Nothing was added, which is what you chose."
        : applied === 1
          ? "Review finished. One item was added to your plan."
          : `Review finished. ${applied} items were added to your plan.`,
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
  memoryPanelTitle: "From your planning note",
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
  regenerateSupport:
    "Say what is wrong and the coach will plan the week again. Anything you already added to your plan stays; the rest is dropped.",
  regenerateLabel: "What should be different?",
  regenerateHelper: "Up to 500 characters.",
  regenerateSubmit: "Ask for a different plan",
  regenerateOpen: "Ask for a different plan",
  regenerateCancel: "Never mind",
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
export const PLAN_PROPOSAL_MIN_DAYS = 1;
export const PLAN_PROPOSAL_MAX_DAYS = 7;
export const PLAN_PROPOSAL_DEFAULT_DAYS = 7;
