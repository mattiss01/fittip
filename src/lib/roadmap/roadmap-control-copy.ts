/**
 * Every roadmap wording a Client Component renders, in the one module it may
 * import.
 *
 * `ROADMAP_COPY` lives in `@/server/roadmap/roadmap-records`, which imports
 * `server-only` and sits under `@/server/**` — both of which the client import
 * boundary in `src/architecture/server-boundary.test.ts` refuses. The compose
 * form, the decision dock and the editor all hold state, so all three are
 * Client Components, and every string they show has to be reachable without
 * crossing that boundary.
 *
 * So these strings live here and `ROADMAP_COPY` spreads them in, exactly as it
 * already does for `ROADMAP_ROUTE_STATE_COPY`. Two consequences worth stating:
 * every roadmap wording is still reachable from that one constant, and no
 * control's label is written in a component. The alternative — passing copy
 * down as props — would serialize the same strings into the client payload on
 * every render, in addition to shipping them in the bundle.
 *
 * Most of what follows is M3-02's, moved here unchanged when M3-15F restored
 * the controls it was written for. The action outcomes are new: M3-11 deleted
 * the module that held them and they came back as strings inlined in a Server
 * Action, which is the drift this module exists to prevent.
 */
export const ROADMAP_CONTROL_COPY = {
  /* ---- Compose ---------------------------------------------------------- */
  /**
   * In the page's corner while a roadmap is in force (ADR-028). It opens a
   * choice of three: two ways to a new proposal, and writing one by hand
   * (ADR-029).
   */
  changeRoadmapAction: "Change roadmap",
  changeWithCoachAction: "Change with Coach",
  changeWithCoachDetail: "Say what should be different",
  newWithCoachAction: "New roadmap with Coach",
  newWithCoachDetail: "Start over from your goals",
  /* Writing one by hand (ADR-029): in force on save, nothing to review. */
  writeAction: "Write it yourself",
  writeDetail: "Your own phases and milestones",
  writeTitle: "Write your roadmap",
  writeSupport: "Saving makes it your roadmap. Nothing is sent to the coach.",
  writeSupportReplaces:
    "Saving makes it your roadmap in place of the one you have. Nothing is sent to the coach.",
  writeNoGoals:
    "Every phase is for at least one goal. Add an active goal first.",
  writeSaveAction: "Save roadmap",
  /* Editing the roadmap in force (ADR-030): the writer's form, opened on it,
     with what has ended locked. */
  rewriteAction: "Edit roadmap",
  rewriteTitle: "Edit your roadmap",
  rewriteSupport:
    "Saving changes your roadmap now. Ticks stay on milestones whose title and date you keep.",
  rewriteSaveAction: "Save changes",
  rewriteStartFixed: "Your roadmap has started, so its start stays.",
  rewriteLocked: "Ended, so it stays as it was.",
  writeFieldLabels: {
    title: "Title",
    summary: "Summary (optional)",
    phase: (index: number) => `Phase ${index}`,
    phaseTitle: "Title",
    phaseFocus: "What it's for",
    phaseStart: "Starts",
    phaseEnd: "Ends",
    phaseStartsWithRoadmap: "Starts with the roadmap.",
    phaseStartsAfter: (previous: number) =>
      `Starts the day after phase ${previous} ends.`,
    goals: "Goals",
    addPhase: "Add phase",
    removePhase: "Remove phase",
    milestone: (index: number) => `Milestone ${index}`,
    milestoneTitle: "Title",
    milestoneDate: "Aim for by",
    /* Renamed from "For" (owner, 14 Oct 2026), and optional. */
    milestoneGoals: "Counts toward (optional)",
    milestoneDetails: "Details (optional)",
    addMilestone: "Add milestone",
    removeMilestone: "Remove milestone",
  },
  /**
   * What is checked when the owner saves (owner, 14 Oct 2026): phase ends may
   * be typed in any order, and whether they add up is said here, by phase.
   */
  writeChecks: {
    phaseNoEnd: (phase: number) => `Phase ${phase} needs an end date.`,
    phaseEndsBeforeStart: (phase: number) =>
      `Phase ${phase} ends before it starts. Its start follows from the phase before.`,
    phaseEndsAfterRoadmap: (phase: number) =>
      `Phase ${phase} ends after the roadmap does.`,
    phaseNoGoal: (phase: number) => `Phase ${phase} needs at least one goal.`,
    milestoneOutsidePhase: (phase: number) =>
      `A milestone in phase ${phase} falls outside that phase's dates.`,
    phaseEndsBeforeToday: (phase: number) =>
      `Phase ${phase} has not ended yet, so it cannot end before today.`,
    lastPhaseEnd: (phase: number, roadmapEnd: string) =>
      `Phase ${phase} is the last, so it has to end with the roadmap, on ${roadmapEnd}.`,
  },
  /* The change form. What is sent is said, because it is more than a new
     roadmap sends: the whole roadmap, where that sends an outline. */
  changeTitle: "Change with Coach",
  changeNoteLabel: "What should change?",
  changeSupport:
    "The coach is sent your whole roadmap and what you write here. Nothing changes until you accept a proposal.",
  changeConfirm: "Ask the coach",
  composeTitle: "Shape your roadmap",
  /* Short, for two dates side by side at 390px (owner, 13 Oct 2026). */
  startDateLabel: "Starts",
  endDateLabel: "Ends",
  planningNoteLabel: "Anything the coach should account for? (optional)",
  generateAction: "Generate roadmap proposal",
  generateSupport: "Nothing changes until you accept a proposal.",
  pending:
    "Building your roadmap proposal... Your current roadmap stays unchanged.",

  /**
   * The two sentences the lost-render watchdog drives.
   *
   * Both are bounded by what a resource-timing entry can prove, which is that
   * a response arrived and nothing about what it said — these actions answer
   * 200 for a conflict, a validation failure and an expired session alike. So
   * neither claims anything was saved: the first says the step did not appear
   * and the page is reloading, the second says the reload happened and what is
   * on screen is what is stored. See `@/lib/app-router/transition-watchdog`.
   */
  lostRender:
    "This roadmap step did not appear. Reloading to show what is saved.",
  recoveredReload:
    "Your last roadmap step did not appear, so this page was reloaded. What you see below is what is saved.",

  /* ---- Regenerate ------------------------------------------------------- */
  regenerateTitle: "Ask for another proposal",
  regenerateAction: "Regenerate proposal",
  feedbackLabel: "What should the coach change?",
  regenerateSupport:
    "The previous proposal will be shared with the coach. Nothing changes until you accept.",
  regenerateConfirm: "Generate another proposal",
  regenerateDatesFixed:
    "A regeneration keeps the same dates. Start a fresh request to change them.",
  regenerationsRemaining: (remaining: number) =>
    `${remaining} regeneration${remaining === 1 ? "" : "s"} left on these dates.`,
  regenerationCapReached:
    "You have used all three regenerations for these dates. Edit the proposal directly, or change the dates to start a fresh request.",

  /* ---- Decide ----------------------------------------------------------- */
  decideTitle: "Your decision",
  decideSupport:
    "Accepting makes this your roadmap. Declining changes nothing.",
  acceptAction: "Accept roadmap",
  editAction: "Edit proposal",
  declineAction: "Decline proposal",
  declineConfirm: "Decline this proposal? It will not become your roadmap.",
  /* "Ask again" on the proposal itself (owner, 14 Oct 2026): the note is
     written while the proposal can still be read. */
  askAgainAction: "Ask for another",
  askAgainLabel: "What should change?",
  askAgainConfirm: "Decline and ask again",
  askAgainSupport:
    "This proposal is declined and the coach is sent it with what you write.",
  askAgainCancel: "Cancel",

  /* ---- Milestones (ADR-026) ---------------------------------------------- */
  /**
   * One answer, reached (owner, 13 Oct 2026). A milestone not marked says
   * nothing: not "open", and never "missed", whatever its date.
   */
  milestoneReached: (date: string) => `Reached ${date}`,
  /** The tick is a circle with no words, so a screen reader is told these. */
  milestoneReachLabel: (title: string) => `Mark reached: ${title}`,
  milestoneUndoLabel: (title: string) => `Undo reached: ${title}`,

  /* ---- Reviews (ADR-027) -------------------------------------------------- */
  /**
   * A phase of the roadmap in force has ended, or the roadmap has. The app
   * asks the owner to look; it does not say what to conclude.
   */
  reviewDuePhase: (phase: number) => `Phase ${phase} has ended`,
  reviewDuePhaseBody:
    "A good moment to look at your roadmap again. Does what comes next still fit?",
  reviewDueRoadmap: "Your roadmap has ended",
  reviewDueRoadmapBody:
    "Nothing is planned beyond it. Ask for a new roadmap when you are ready.",
  reviewedAction: "Reviewed",
  /** On the Plan's Roadmap chip, for a screen reader: the dot has no words. */
  reviewDueNote: "A roadmap review is due.",

  /* ---- Edit ------------------------------------------------------------- */
  editTitle: "Edit proposal",
  editSupport: "Saving creates a new proposal to review.",
  editDatesFixed: "The dates are the ones you asked the coach for.",
  editSaveAction: "Save as a new proposal",
  editCancelAction: "Cancel",
  editFieldLabels: {
    title: "Roadmap title",
    summary: "Summary",
    phase: (index: number) => `Phase ${index}`,
    phaseTitle: "Title",
    phaseFocus: "Focus",
    phaseStart: "Starts",
    phaseEnd: "Ends",
    attention: "Attention",
    milestone: "Milestone",
    /* Renamed by the owner on 14 Oct 2026, and optional since. */
    milestoneCriterion: "Details (optional)",
    milestoneDate: "Aim for by",
    milestoneRemove: "Remove milestone",
  },

  /**
   * The example label.
   *
   * It rests on the stored `provider_code` of `fixture` and on nothing else.
   * No credential is configured, so every proposal the built-in coach writes is
   * a canned answer that still becomes permanent history the moment it is
   * accepted. An owner who cannot tell that apart from a coach-written roadmap
   * would be reading an example as advice.
   */
  exampleLabel: "Example",
  exampleNotice:
    "Written by the built-in example coach, not by a coaching model. You can accept, edit or decline it; the wording is an example.",

  /**
   * What every action says when it comes back.
   *
   * None of these echoes a provider message, a database message, or the
   * owner's own text: the note and the feedback are the two fields ADR-014
   * admits to the coaching boundary, and neither travels in an error.
   */
  outcomes: {
    proposalReady: "A proposal is ready below.",
    accepted: "Accepted. This is your roadmap now.",
    declined: "Declined.",
    edited: "Saved as a new proposal. Review it below.",
    written: "Saved. This is your roadmap now.",
    rewritten: "Saved. Your roadmap is changed.",
    /* "Ask for another" after its decline (owner, 14 Oct 2026). */
    askAgainFailed:
      "The proposal was declined, but the coach could not prepare another. Ask for a new roadmap below.",
    askAgainPending:
      "The proposal was declined and another is being prepared. Reload in a moment to see it.",
    askAgainUsedUp:
      "You have asked for another three times on these dates. Edit this proposal, or decline it and ask for a new roadmap.",
    /**
     * An attempt under this key is already running, so no second one was made
     * and this screen will never be told how the first ended. Reloading is the
     * only thing the owner can do about it, so it is what the sentence asks
     * for.
     */
    pendingElsewhere:
      "That request is already running. Reload in a moment to see where it went.",
    feedbackRequired: "Say what the coach should change before asking again.",
    regenerationDatesPassed:
      "The first day of that proposal has passed. Start a fresh request for new dates.",
    feedbackWithoutRegeneration:
      "Feedback belongs to a regeneration, not a first request.",
    requestUnidentified: "That request could not be identified. Try again.",
    noteTooLong:
      "That note is longer than 1,000 characters. Shorten it and try again.",
    feedbackTooLong:
      "That feedback is longer than 500 characters. Shorten it and try again.",
    checkDetails: "Check the highlighted details. Nothing has been saved yet.",
    sourcesChanged:
      "Your goals, memory or training changed after this was prepared. Review it again.",
    alreadyDecided:
      "That proposal has already been decided. Reload to see where it went.",
    stale: "Your roadmap changed in another tab. Reload before deciding again.",
    notAvailable:
      "That proposal is no longer available. Reload to see where it went.",
    /**
     * Another roadmap was accepted after this proposal was made, in another
     * tab or on another device. Reloading would not help: it has to go.
     */
    roadmapMoved:
      "Your roadmap changed since this was proposed. Decline it and ask again.",
    /**
     * The database's one refusal for a mark (ADR-026): the roadmap moved on
     * under the page, or the request was not the page's. Nothing was changed.
     */
    /** ADR-028: a change request with nothing in it, or nothing to change. */
    changeNoteRequired: "Say what should change.",
    changeNothingToChange:
      "There is no roadmap to change. Ask for a new one instead.",
    milestoneUnavailable:
      "That milestone could not be changed. Reload to see your roadmap as it is now.",
    /** The same, for a review (ADR-027). */
    reviewUnavailable:
      "That review could not be marked. Reload to see your roadmap as it is now.",
    sessionEnded: "Your session ended. Sign in again before continuing.",
    /**
     * The one context minimum this surface can hit. The coach reads the
     * owner's window from their confirmed zone and has nothing to read without
     * one, so the refusal names the zone rather than the coach.
     */
    timezoneRequired:
      "Confirm your time zone on the Plan before asking for a roadmap. The coach reads your weeks from it.",
    notEnoughSetUp:
      "There is not enough set up yet for the coach to work from. Add an active goal first.",
    generationFailed:
      "That proposal could not be prepared. Nothing was saved; try again.",
    decisionFailed: "That could not be saved. Nothing changed; try again.",
  },

  /** The editor's rejections, which name the rule rather than the field. */
  editRejections: {
    business_rule:
      "Phases must run back to back and cover the whole roadmap, with no gap and no overlap.",
    impossible_date:
      "Every date must sit inside the roadmap, and each milestone inside its own phase.",
    unowned_goal_reference:
      "One of the goals is no longer active. Reload and edit again.",
    unsafe_content:
      "That wording cannot be saved. FitTip does not diagnose, prescribe, or call training safe.",
    safety_requirement:
      "You recorded a symptom recently, so the roadmap needs at least one note about how it holds load back.",
  },

  /**
   * A hand-written roadmap's rejections (ADR-029). Gaps and overlaps cannot
   * be entered on that form, so what is left is a field, a goal or a date.
   */
  writeRejections: {
    schema: "Fill in every field that is not marked optional.",
    business_rule:
      "Every phase and every milestone needs a goal, and a phase names a goal once.",
    impossible_date:
      "Each phase must end after it starts, and each milestone fall inside its phase.",
    unowned_goal_reference:
      "One of the goals is no longer active. Reload and try again.",
    unsafe_content:
      "That wording cannot be saved. FitTip does not diagnose, prescribe, or call training safe.",
    too_large: "That roadmap is too long to save. Shorten some of its text.",
    dates:
      "A roadmap starts between today and 30 days from now, and runs four to fifty-two weeks.",
  },

  /**
   * Editing the roadmap in force (ADR-030): a hand-written roadmap's
   * rejections, with its own dates and the two things only an edit can get
   * wrong.
   */
  rewriteRejections: {
    schema: "Fill in every field that is not marked optional.",
    business_rule:
      "Every phase and every milestone needs a goal, and a phase names a goal once.",
    impossible_date:
      "Each phase must end after it starts, and each milestone fall inside its phase.",
    unowned_goal_reference:
      "One of the goals is no longer active. Reload and try again.",
    unsafe_content:
      "That wording cannot be saved. FitTip does not diagnose, prescribe, or call training safe.",
    too_large: "That roadmap is too long to save. Shorten some of its text.",
    dates:
      "A roadmap runs four to fifty-two weeks from its start, and cannot end before today.",
    endsBeforeToday: "A phase that has not ended yet cannot end before today.",
    noRoadmap: "There is no roadmap to edit any more. Reload the page.",
  },

  /** Decision 4a: an over-large context names its source. */
  contextTooLarge: {
    memory:
      "There is too much active memory to send in one request. Disable or shorten a few items, then try again.",
    goals:
      "Your active goals are too much to send in one request. Pause a few, or shorten their desired outcomes or the sports they name, then try again.",
    // Achieved goals travel as background on a smaller allowance, and pausing
    // is not offered on one, so the way out is named separately.
    achieved_goals:
      "Your achieved goals are too much to send in one request. Delete a few, or shorten the sports they name, then try again.",
    training_setup:
      "Your training setup is too much to send in one request. Shorten the places, the equipment or the availability note in Settings, then try again.",
    planning_note:
      "That note is longer than the request allows. Shorten it and try again.",
    // ADR-028. A stored roadmap cannot be larger than what a change request
    // may send, so this is not expected; it must still not advise a shorter
    // horizon, which would not help.
    roadmap_to_change:
      "Your roadmap is too large to send whole. Ask for a new roadmap instead.",
    regeneration_feedback:
      "That feedback is longer than the request allows. Shorten it and try again.",
    previous_proposal:
      "The previous proposal is too large to send back to the coach. Edit it directly instead.",
    other: "There is too much to send in one request. Try a shorter horizon.",
  },
} as const;
