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
  composeTitle: "Shape your roadmap",
  composeSupport:
    "A roadmap is months of direction. Pick how far ahead it should look, and say anything the coach could not already know.",
  endDateLabel: "Roadmap ends",
  endDateHelper: "Between four and fifty-two weeks from today.",
  planningNoteLabel: "Anything the coach should account for? (optional)",
  planningNoteHelper:
    "Add commitments or constraints that your saved information does not show. Maximum 1,000 characters.",
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
    "Accepting makes this your current roadmap and keeps every earlier version. Declining keeps it in your history and changes nothing.",
  acceptAction: "Accept roadmap",
  editAction: "Edit proposal",
  declineAction: "Decline proposal",
  declineConfirm:
    "Decline this proposal? It will stay in your roadmap history and will not become current.",

  /* ---- Edit ------------------------------------------------------------- */
  editTitle: "Edit proposal",
  editSupport:
    "Saving creates a new proposal to review. The one you are editing stays in your history exactly as the coach wrote it.",
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
    attentionReason: "Why",
    milestone: "Milestone",
    milestoneCriterion: "What would be observed",
    milestoneDate: "Aim for by",
    reviewPoint: (index: number) => `Review point ${index}`,
    reviewPointTitle: "Title",
    reviewPointQuestion: "Question to reconsider",
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
    "Written by the built-in example coach, not by a coaching model. It is real in your history and you can accept, edit or decline it; the wording is an example.",

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
    declined: "Declined. It stays in your history.",
    edited: "Saved as a new proposal. Review it below.",
    /**
     * An attempt under this key is already running, so no second one was made
     * and this screen will never be told how the first ended. Reloading is the
     * only thing the owner can do about it, so it is what the sentence asks
     * for.
     */
    pendingElsewhere:
      "That request is already running. Reload in a moment to see where it went.",
    feedbackRequired: "Say what the coach should change before asking again.",
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

  /** Decision 4a: an over-large context names its source. */
  contextTooLarge: {
    memory:
      "There is too much active memory to send in one request. Disable or shorten a few items, then try again.",
    goals:
      "There are too many active goals to send in one request. Pause or archive a few, then try again.",
    planning_note:
      "That note is longer than the request allows. Shorten it and try again.",
    regeneration_feedback:
      "That feedback is longer than the request allows. Shorten it and try again.",
    previous_proposal:
      "The previous proposal is too large to send back to the coach. Edit it directly instead.",
    other: "There is too much to send in one request. Try a shorter horizon.",
  },
} as const;
