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
  backLink: "Back to plan",
  routeKicker: "FitTip / plan / coach proposal",
  routeTitle: "Review a coach proposal.",
  routeIntro:
    "The coach proposes days. You decide each one, and only what you choose enters your plan.",

  /* ---- Compose ----------------------------------------------------------- */
  composeTitle: "Ask for a proposal",
  composeSupport:
    "Pick how many days ahead to plan, and say anything the coach could not already know.",
  dayCountLabel: "Days to plan",
  dayCountHelper: "Between one and seven days, starting today.",
  planningNoteLabel: "Anything the coach should account for? (optional)",
  planningNoteHelper:
    "Add commitments or constraints that your saved information does not show. Maximum 1,000 characters.",
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
  lockPlannedAction: "Lock",
  unlockPlannedAction: "Unlock",
  lockPlannedActionFor: (title: string) => `Lock ${title}`,
  unlockPlannedActionFor: (title: string) => `Unlock ${title}`,

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
   * today. The plan's own write refuses a date outside its fourteen-day window,
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
  rejectedBadge: "Rejected",
  lockedBadge: "Locked",
  cancelledBadge: "Cancelled",
  recoveryDayTitle: "Recovery day",
  recoveryDaySupport:
    "The coach put no session on this day. Accepting it marks the day as rest you meant to take, rather than a day you happened to leave empty.",
  recoveryDayAlreadyBadge: "Already a recovery day",

  stageAction: "Add to plan",
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
  discardConfirm: (staged: number) =>
    staged === 1
      ? "Discard this proposal? One staged item will not be added."
      : `Discard this proposal? ${staged} staged items will not be added.`,

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

  /* ---- Empty states ------------------------------------------------------ */
  noProposalTitle: "No proposal open",
  noProposalSupport:
    "Ask the coach for one above. It will be laid out day by day next to what you already have planned.",
  noGoalsNotice:
    "You have no active goals, so a proposal will stay deliberately general. Adding a goal first gives the coach something to aim at.",
} as const;

export const PLAN_PROPOSAL_NOTE_MAX_LENGTH = 1000;
export const PLAN_PROPOSAL_MIN_DAYS = 1;
export const PLAN_PROPOSAL_MAX_DAYS = 7;
export const PLAN_PROPOSAL_DEFAULT_DAYS = 7;
