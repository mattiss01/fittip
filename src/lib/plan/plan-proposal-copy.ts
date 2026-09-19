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
    "This is already on your plan. The coach knew about it, and the review leaves it alone.",
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
