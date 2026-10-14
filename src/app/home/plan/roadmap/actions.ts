"use server";

import { revalidatePath } from "next/cache";

// A `"use server"` module may export nothing but async functions, so the state
// type and its initial value live in `action-state.ts` and the client imports
// them from there directly.
import type { RoadmapActionDraft, RoadmapActionState } from "./action-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";
import { lockedPhaseCount } from "@/lib/roadmap/roadmap-locked-phases";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  CoachAIContextBelowMinimumError,
  CoachAIContextTooLargeError,
} from "@/server/ai/context";
import { CoachAIError } from "@/server/ai/errors";
import { verifyCoachAIOwner } from "@/server/ai/owner";
import {
  OwnerTextValidationError,
  parsePlanningNote,
  parseRegenerationFeedback,
} from "@/server/ai/owner-text";
import { validateRoadmapCandidate } from "@/server/ai/output-validation";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
  RoadmapConflictError,
} from "@/server/repositories/roadmap-repository";
import {
  buildOwnerRoadmapValidation,
  buildOwnerRoadmapValidationContext,
} from "@/server/roadmap/roadmap-edit";
import { generateRoadmapProposal } from "@/server/roadmap/roadmap-generation";
import {
  parseExpectedHeadRevision,
  parseRoadmapEndDate,
  parseRoadmapPosition,
  parseRoadmapStartDate,
  parseRoadmapProposalId,
  parseRoadmapVersionId,
  ROADMAP_MAX_REGENERATIONS,
  RoadmapValidationError,
} from "@/server/roadmap/roadmap-records";

/**
 * The roadmap Server Actions.
 *
 * Every one of them authenticates first. A Server Action is a public endpoint,
 * not a private function, so the owner is derived from verified Auth claims and
 * never from anything the form carried — the owner id is not a form field here
 * and could not be, because none of ADR-015's five functions accepts one.
 *
 * Two other things are deliberately not taken from the request. The owner's
 * today is read from their confirmed time zone rather than from a hidden field,
 * so a wrong or hostile value cannot move the horizon every later check is
 * measured against. And the expected head revision, which the accept path does
 * take from the form, is only ever a *stale* value in the owner's own hands:
 * the database compares it against the real head under a lock and refuses a
 * mismatch, so the worst a tampered one can do is refuse the tamperer's own
 * acceptance.
 *
 * Nothing here formats a user-visible string. Every message comes from
 * `ROADMAP_CONTROL_COPY`, which `ROADMAP_COPY` spreads in, so the surface and
 * its actions cannot drift apart in wording.
 */

const OUTCOMES = ROADMAP_CONTROL_COPY.outcomes;

/** A coach request's idempotency key, as the database bounds it. */
const REQUEST_KEY = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Compose, for an initial request and for a regeneration alike.
 *
 * Which one it is is decided by whether a predecessor is present, and the
 * database re-derives that independently. Nothing here trusts a hidden field to
 * say "this is a regeneration": a claimed regeneration with no declined,
 * same-horizon predecessor is refused before the coach is called.
 */
export async function generateRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  const draft: RoadmapActionDraft = {
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    planningNote: text(formData, "planningNote"),
    regenerationFeedback: text(formData, "regenerationFeedback"),
  };

  try {
    const [owner, roadmaps, profiles] = await Promise.all([
      createServerUserClient().then(verifyCoachAIOwner),
      createRoadmapRepository(),
      createProfileRepository(),
    ]);

    const today = await ownerToday(profiles);
    const previousProposalId = optionalProposalId(
      formData.get("previousProposalId"),
    );
    const startDate = parseRoadmapStartDate(
      draft.startDate,
      today,
      previousProposalId !== null,
    );
    // A regeneration is the same question about the same dates, and those
    // dates are no longer askable once the first has passed. Said here: the
    // database would refuse it as an invalid request, or, on the one day of
    // slack it allows for time zones, accept a roadmap that began yesterday.
    if (previousProposalId !== null && startDate < today) {
      return invalid(OUTCOMES.regenerationDatesPassed, submission, draft);
    }
    const endDate = parseRoadmapEndDate(draft.endDate, startDate);
    const planningNote = parsePlanningNote(draft.planningNote);
    const regenerationFeedback = parseRegenerationFeedback(
      draft.regenerationFeedback,
    );

    // ADR-014 decision 6: feedback is required on a regeneration and starts
    // empty on every round. "Required and starts empty" is trivially checkable,
    // where "must differ from its prefill" is weak and gameable.
    if (previousProposalId !== null && regenerationFeedback === null) {
      return invalid(OUTCOMES.feedbackRequired, submission, draft);
    }
    if (previousProposalId === null && regenerationFeedback !== null) {
      return invalid(OUTCOMES.feedbackWithoutRegeneration, submission, draft);
    }

    // ADR-028. A change request is a first request that also sends the whole
    // roadmap in force. It says what should change, it is not a second answer
    // to an earlier question, and there has to be a roadmap: which one is
    // read from the owner's records, never named by the form.
    const changeRoadmap = text(formData, "changeRoadmap") === "true";
    if (changeRoadmap) {
      if (previousProposalId !== null) {
        return invalid(OUTCOMES.checkDetails, submission, draft);
      }
      if (planningNote === null) {
        return invalid(OUTCOMES.changeNoteRequired, submission, draft);
      }
    }

    const idempotencyKey = text(formData, "idempotencyKey");
    if (!REQUEST_KEY.test(idempotencyKey)) {
      return invalid(OUTCOMES.requestUnidentified, submission, draft);
    }

    const head = await roadmaps.getHead();
    if (changeRoadmap && head.currentVersionId === null) {
      return invalid(OUTCOMES.changeNothingToChange, submission, draft);
    }
    const result = await generateRoadmapProposal(
      {
        owner,
        startDate,
        endDate,
        expectedHeadRevision: head.revision,
        planningNote,
        previousProposalId,
        regenerationFeedback,
        idempotencyKey,
        ...(changeRoadmap ? { changeRoadmap: true } : {}),
      },
      { roadmaps },
    );

    if (result.status === "proposal") {
      return landed("proposal", submission);
    }
    if (result.status === "pending") {
      // The attempt under this key is already running somewhere else, so this
      // screen will never be told how it ended. The copy asks for the one
      // thing that settles it rather than leaving a pending sentence on a tab
      // that cannot update.
      return {
        status: "pending",
        message: OUTCOMES.pendingElsewhere,
        submission,
      };
    }
    return {
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      draft,
    };
  } catch (error) {
    return toActionState(error, submission, draft);
  }
}

export async function acceptRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    await roadmaps.acceptProposal(
      parseRoadmapProposalId(formData.get("proposalId")),
      parseExpectedHeadRevision(formData.get("expectedHeadRevision")),
    );
    return landed("accepted", submission);
  } catch (error) {
    return toActionState(error, submission);
  }
}

export async function declineRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    await roadmaps.declineProposal(
      parseRoadmapProposalId(formData.get("proposalId")),
    );
    return landed("declined", submission);
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * "Ask again" on a coach proposal (owner, 14 Oct 2026): what should change,
 * written while the proposal is on screen, then the proposal is declined and
 * another asked for, in one step.
 *
 * The decline comes first because the database asks a regeneration for a
 * declined predecessor. Everything that can be known before it is checked
 * before it — the note, the ceiling, the dates — so a request that could never
 * run does not cost the owner the proposal. If the coach then fails, the
 * proposal stays declined and the page offers a new request, as a decline
 * would; the route is refreshed so it says so.
 */
export async function askAgainRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  const regenerationFeedback = text(formData, "regenerationFeedback");
  try {
    const [roadmaps, profiles] = await Promise.all([
      createRoadmapRepository(),
      createProfileRepository(),
      // The coach's owner check, before anything is declined.
      createServerUserClient().then(verifyCoachAIOwner),
    ]);
    const id = parseRoadmapProposalId(formData.get("proposalId"));
    if (parseRegenerationFeedback(regenerationFeedback) === null) {
      return invalid(OUTCOMES.feedbackRequired, submission);
    }
    if (!REQUEST_KEY.test(text(formData, "idempotencyKey"))) {
      return invalid(OUTCOMES.requestUnidentified, submission);
    }
    const proposal = await roadmaps.getProposal(id);
    // Declined already is the same request coming again after a reply that
    // never arrived: it goes on to the coach under the same key, which
    // replays the first attempt rather than paying for a second.
    if (
      !proposal ||
      (proposal.decision !== null && proposal.decision !== "rejected")
    ) {
      throw new RoadmapConflictError("not-available");
    }
    if (proposal.regenerationNumber >= ROADMAP_MAX_REGENERATIONS) {
      return {
        status: "cap-reached",
        message: OUTCOMES.askAgainUsedUp,
        submission,
      };
    }
    const startDate = proposal.startDate || proposal.content.startDate;
    const endDate = proposal.endDate || proposal.content.endDate;
    if (startDate < (await ownerToday(profiles))) {
      return invalid(OUTCOMES.regenerationDatesPassed, submission);
    }
    parseRoadmapEndDate(endDate, startDate);

    if (proposal.decision === null) await roadmaps.declineProposal(id);
    revalidatePath("/home/plan/roadmap");

    const request = new FormData();
    request.set("previousProposalId", id);
    request.set("startDate", startDate);
    request.set("endDate", endDate);
    request.set("regenerationFeedback", regenerationFeedback);
    request.set("idempotencyKey", text(formData, "idempotencyKey"));
    const asked = await generateRoadmapAction(previous, request);
    if (asked.status === "proposal") return asked;
    // The proposal is declined now and this dock goes with it, so a refusal
    // rendered here would never be read. Said as a landed decline instead,
    // which the page keeps above the form it now shows.
    return {
      status: "declined",
      message:
        asked.status === "pending"
          ? OUTCOMES.askAgainPending
          : OUTCOMES.askAgainFailed,
      submission: asked.submission,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * An edit creates a new reviewable proposal linked to its source.
 *
 * The draft arrives as one JSON field rather than as flattened form fields,
 * because a roadmap is nested three deep and reassembling that shape from field
 * names would be a second, silent contract. It costs nothing in trust: the body
 * is handed to `validateRoadmapCandidate` — the same validator the coach's own
 * output goes through — and bounded again inside the database, so malformed
 * JSON is a validation failure like any other. An owner is not more trusted
 * than the coach here: they are equally capable of leaving a six-day gap
 * between two phases.
 */
export async function editRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    const id = parseRoadmapProposalId(formData.get("proposalId"));
    const source = await roadmaps.getProposal(id);
    if (!source) throw new RoadmapConflictError("not-available");

    const validation = validateRoadmapCandidate({
      // The submitted text is handed straight to the validator, which parses it
      // itself and rejects anything that is not a valid roadmap. Parsing here
      // first would only move the same refusal earlier under a vaguer message.
      body: `{"roadmap":${text(formData, "content") || "null"},"memoryCandidates":null}`,
      context: await buildOwnerRoadmapValidationContext(source),
    });

    if (validation.outcome === "rejected") {
      return invalid(
        rejectionMessage(
          ROADMAP_CONTROL_COPY.editRejections,
          validation.reason,
        ),
        submission,
      );
    }

    await roadmaps.editProposal(id, validation.response.roadmap);
    return landed("edited", submission);
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * A roadmap written by hand, in force on save (ADR-029).
 *
 * The draft arrives as one JSON field, as an edit's does, and goes through the
 * same validator the coach's output goes through. Its dates are held to the
 * range a coach request has first: from today to thirty days ahead, four to
 * fifty-two weeks long. The owner's today is read from their confirmed zone,
 * never from the form.
 *
 * The expected head is the one the page read, so a roadmap accepted in another
 * tab since then refuses the write rather than being replaced by it.
 */
export async function writeRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const [roadmaps, profiles] = await Promise.all([
      createRoadmapRepository(),
      createProfileRepository(),
    ]);
    const today = await ownerToday(profiles);
    const expectedHeadRevision = parseExpectedHeadRevision(
      formData.get("expectedHeadRevision"),
    );

    const body = text(formData, "content") || "null";
    let dates: { startDate: unknown; endDate: unknown } = {
      startDate: undefined,
      endDate: undefined,
    };
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null) {
        dates = parsed as typeof dates;
      }
    } catch {
      // Left to the validator below, which refuses it as unparsable.
    }
    let startDate: string;
    let endDate: string;
    try {
      // An empty start would be read as today; a roadmap written by hand
      // always names its own.
      if (dates.startDate === "" || dates.startDate === undefined) {
        throw new RoadmapValidationError("startDate");
      }
      startDate = parseRoadmapStartDate(dates.startDate, today, false);
      endDate = parseRoadmapEndDate(dates.endDate, startDate);
    } catch (error) {
      if (error instanceof RoadmapValidationError) {
        return invalid(WRITE_REJECTIONS.dates, submission);
      }
      throw error;
    }
    // `parseRoadmapStartDate` reads a start of yesterday as today, a form left
    // open over midnight. The roadmap's own date has to agree with it.
    if (startDate !== dates.startDate) {
      return invalid(WRITE_REJECTIONS.dates, submission);
    }

    const validation = validateRoadmapCandidate({
      body: `{"roadmap":${body},"memoryCandidates":null}`,
      context: await buildOwnerRoadmapValidationContext({ startDate, endDate }),
    });
    if (validation.outcome === "rejected") {
      return invalid(
        rejectionMessage(WRITE_REJECTIONS, validation.reason),
        submission,
      );
    }

    await roadmaps.writeRoadmap(
      validation.response.roadmap,
      expectedHeadRevision,
    );
    return landed("written", submission);
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * The roadmap in force, edited by hand and in force at once (ADR-030).
 *
 * What the form may not change is not taken from it. The start is the stored
 * one, and the phases that have ended (owner, 14 Oct 2026: the past stays
 * fixed) are put back from the stored roadmap whatever the form sent, so a
 * stale or tampered form cannot rewrite them; `edit_roadmap` refuses a change
 * to them on its own. Which version is in force is the database's to say: the
 * head the page read is compared under the lock.
 *
 * The goals of a locked phase may have been achieved since, so the validation
 * context keeps them, as long as they are still the owner's.
 */
export async function rewriteRoadmapAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const [roadmaps, profiles] = await Promise.all([
      createRoadmapRepository(),
      createProfileRepository(),
    ]);
    const today = await ownerToday(profiles);
    const expectedHeadRevision = parseExpectedHeadRevision(
      formData.get("expectedHeadRevision"),
    );
    const current = await roadmaps.getCurrentVersion();
    if (current === null) {
      return invalid(REWRITE_REJECTIONS.noRoadmap, submission);
    }
    const stored = current.content;

    let sent: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text(formData, "content") || "null");
      if (typeof parsed === "object" && parsed !== null) {
        sent = parsed as Record<string, unknown>;
      }
    } catch {
      // Left to the validator below, which refuses an empty roadmap.
    }

    const startDate = stored.startDate;
    let endDate: string;
    try {
      endDate = parseRoadmapEndDate(sent.endDate, startDate);
    } catch (error) {
      if (error instanceof RoadmapValidationError) {
        return invalid(REWRITE_REJECTIONS.dates, submission);
      }
      throw error;
    }
    if (endDate < today) return invalid(REWRITE_REJECTIONS.dates, submission);

    const locked = lockedPhaseCount(stored.phases, today);
    const sentPhases = Array.isArray(sent.phases) ? [...sent.phases] : [];
    if (sentPhases.length < locked) {
      return invalid(REWRITE_REJECTIONS.schema, submission);
    }
    const phases = [
      ...stored.phases.slice(0, locked),
      ...sentPhases.slice(locked),
    ];
    for (const phase of phases.slice(locked)) {
      const end = (phase as { endDate?: unknown } | null)?.endDate;
      if (typeof end === "string" && end < today) {
        return invalid(REWRITE_REJECTIONS.endsBeforeToday, submission);
      }
    }

    const { context, activeGoalIds } = await buildOwnerRoadmapValidation({
      startDate,
      endDate,
      keepGoalIds: stored.phases.slice(0, locked).flatMap(goalIdsOf),
    });
    const validation = validateRoadmapCandidate({
      body: JSON.stringify({
        roadmap: { ...sent, startDate, phases },
        memoryCandidates: null,
      }),
      context,
    });
    if (validation.outcome === "rejected") {
      return invalid(
        rejectionMessage(REWRITE_REJECTIONS, validation.reason),
        submission,
      );
    }
    // A goal kept for an ended phase is not one a phase that can still
    // change may take up.
    if (
      validation.response.roadmap.phases
        .slice(locked)
        .some((phase) => goalIdsOf(phase).some((id) => !activeGoalIds.has(id)))
    ) {
      return invalid(REWRITE_REJECTIONS.unowned_goal_reference, submission);
    }

    await roadmaps.editRoadmap(
      validation.response.roadmap,
      expectedHeadRevision,
    );
    return landed("rewritten", submission);
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * Mark a milestone of the roadmap in force reached, or take the mark back
 * (ADR-026).
 *
 * The form says which milestone and which way. Whose roadmap it is, that the
 * version is the one in force, that the milestone exists, and the day are the
 * database's to decide; nothing here is trusted for any of them. It says
 * nothing on success: the milestone itself shows the mark.
 */
export async function setMilestoneReachedAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    await roadmaps.setMilestoneReached({
      versionId: parseRoadmapVersionId(formData.get("versionId")),
      phaseIndex: parseRoadmapPosition(
        formData.get("phaseIndex"),
        "phaseIndex",
      ),
      milestoneIndex: parseRoadmapPosition(
        formData.get("milestoneIndex"),
        "milestoneIndex",
      ),
      reached: text(formData, "reached") === "true",
    });
    revalidatePath("/home/plan/roadmap");
    return { status: "marked", message: "", submission };
  } catch (error) {
    // Said in the milestone's own words: the shared sentences are about a
    // proposal, and about details there are none of here to check.
    if (
      error instanceof RoadmapConflictError ||
      error instanceof RoadmapValidationError
    ) {
      return {
        status:
          error instanceof RoadmapConflictError ? "conflict" : "validation",
        message: OUTCOMES.milestoneUnavailable,
        submission,
      };
    }
    return toActionState(error, submission);
  }
}

/**
 * Mark a due review of the roadmap in force reviewed (ADR-027).
 *
 * The form says which roadmap and which phase. That the phase has ended, that
 * the roadmap is the caller's and in force, and the day are the database's to
 * decide. It says nothing on success: the review's card goes.
 */
export async function setRoadmapReviewedAction(
  previous: RoadmapActionState,
  formData: FormData,
): Promise<RoadmapActionState> {
  const submission = previous.submission + 1;
  try {
    const roadmaps = await createRoadmapRepository();
    await roadmaps.setReviewed({
      versionId: parseRoadmapVersionId(formData.get("versionId")),
      phaseIndex: parseRoadmapPosition(
        formData.get("phaseIndex"),
        "phaseIndex",
      ),
    });
    revalidatePath("/home/plan/roadmap");
    // The Plan's Roadmap chip carries the dot this clears.
    revalidatePath("/home/plan");
    return { status: "reviewed", message: "", submission };
  } catch (error) {
    if (
      error instanceof RoadmapConflictError ||
      error instanceof RoadmapValidationError
    ) {
      return {
        status:
          error instanceof RoadmapConflictError ? "conflict" : "validation",
        message: OUTCOMES.reviewUnavailable,
        submission,
      };
    }
    return toActionState(error, submission);
  }
}

/**
 * What every successful write returns: the status that says it landed, and the
 * approved sentence for it.
 *
 * The route is invalidated first, so the revalidated tree travels back with the
 * reply rather than behind it, and the surface renders both in one commit. That
 * is what makes a success sentence worth returning: the screen the owner reads
 * it on is already the screen the write produced.
 */
type Landed =
  | "proposal"
  | "accepted"
  | "declined"
  | "edited"
  | "written"
  | "rewritten";

function landed(status: Landed, submission: number): RoadmapActionState {
  revalidatePath("/home/plan/roadmap");
  // A roadmap written or edited by hand is in force at once, and the Plan
  // reads it.
  if (status === "written" || status === "rewritten") {
    revalidatePath("/home/plan");
  }
  return { status, message: SUCCESS[status], submission };
}

const SUCCESS: Record<Landed, string> = {
  proposal: OUTCOMES.proposalReady,
  accepted: OUTCOMES.accepted,
  declined: OUTCOMES.declined,
  edited: OUTCOMES.edited,
  written: OUTCOMES.written,
  rewritten: OUTCOMES.rewritten,
};

/**
 * The owner's own calendar date.
 *
 * Read from the confirmed zone rather than sent by the browser. A roadmap's
 * whole horizon is measured from it, and the same value becomes the proposal's
 * start date, so accepting a client-supplied one would let a request choose the
 * window every later validation is checked against. An unconfirmed zone falls
 * back to UTC here and is refused a few lines later by the context source,
 * which is where the owner gets told what to do about it.
 */
async function ownerToday(
  profiles: Awaited<ReturnType<typeof createProfileRepository>>,
): Promise<string> {
  const profile = await profiles.getCurrentProfile();
  return profile?.timezoneName == null
    ? new Date().toISOString().slice(0, 10)
    : isoDateInTimezone(new Date(), profile.timezoneName);
}

/** Every goal a phase names, for itself or for one of its milestones. */
function goalIdsOf(phase: {
  goalAttention: { goalId: string }[];
  milestones: { goalIds: string[] }[];
}): string[] {
  return [
    ...phase.goalAttention.map((entry) => entry.goalId),
    ...phase.milestones.flatMap((milestone) => milestone.goalIds),
  ];
}

const WRITE_REJECTIONS = ROADMAP_CONTROL_COPY.writeRejections;
const REWRITE_REJECTIONS = ROADMAP_CONTROL_COPY.rewriteRejections;

/** A validator's reason in the form's own words, or the general refusal. */
function rejectionMessage(
  rejections: Readonly<Record<string, string>>,
  reason: string,
): string {
  return rejections[reason] ?? OUTCOMES.checkDetails;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalProposalId(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return parseRoadmapProposalId(value);
}

function invalid(
  message: string,
  submission: number,
  draft?: RoadmapActionDraft,
): RoadmapActionState {
  return {
    status: "validation",
    message,
    submission,
    ...(draft ? { draft } : {}),
  };
}

/**
 * One place that turns a thrown error into a state a screen can render.
 *
 * No branch here surfaces a provider message, a database message, or the
 * owner's own text. `CoachAIError` already carries user-safe copy from a fixed
 * table, and even that is not forwarded verbatim: the roadmap's own wording is
 * what the owner reads, so a coaching-layer sentence cannot leak the shape of a
 * configuration problem onto this surface.
 */
function toActionState(
  error: unknown,
  submission: number,
  draft?: RoadmapActionDraft,
): RoadmapActionState {
  if (error instanceof OwnerTextValidationError) {
    return invalid(
      error.field === "planning_note"
        ? OUTCOMES.noteTooLong
        : OUTCOMES.feedbackTooLong,
      submission,
      draft,
    );
  }
  if (error instanceof RoadmapValidationError) {
    return invalid(OUTCOMES.checkDetails, submission, draft);
  }
  if (error instanceof RoadmapConflictError) {
    if (error.reason === "regeneration-cap") {
      return {
        status: "cap-reached",
        message: ROADMAP_CONTROL_COPY.regenerationCapReached,
        submission,
      };
    }
    return {
      status: "conflict",
      message:
        error.reason === "sources-changed"
          ? OUTCOMES.sourcesChanged
          : error.reason === "already-decided"
            ? OUTCOMES.alreadyDecided
            : error.reason === "not-available"
              ? OUTCOMES.notAvailable
              : error.reason === "roadmap-moved"
                ? OUTCOMES.roadmapMoved
                : OUTCOMES.stale,
      submission,
    };
  }
  if (error instanceof CoachAIContextBelowMinimumError) {
    // Decision 5's refusal, named rather than generalized. The one requirement
    // this surface can actually hit is the time zone: the context source reads
    // the owner's window from it and has nothing to read without one.
    return invalid(
      error.missing.includes("resolved_timezone")
        ? OUTCOMES.timezoneRequired
        : OUTCOMES.notEnoughSetUp,
      submission,
      draft,
    );
  }
  if (error instanceof CoachAIContextTooLargeError) {
    // Decision 4a: name the source. "There is too much to consider" is a
    // refusal nobody can act on.
    return invalid(contextSourceMessage(error.source), submission, draft);
  }
  if (error instanceof CoachAIError) {
    return {
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      ...(draft ? { draft } : {}),
    };
  }
  if (
    error instanceof RoadmapAuthenticationError ||
    error instanceof ProfileAuthenticationError
  ) {
    return { status: "session", message: OUTCOMES.sessionEnded, submission };
  }
  return {
    status: "error",
    message: draft ? OUTCOMES.generationFailed : OUTCOMES.decisionFailed,
    submission,
    ...(draft ? { draft } : {}),
  };
}

function contextSourceMessage(source: string): string {
  const tooLarge = ROADMAP_CONTROL_COPY.contextTooLarge;
  switch (source) {
    case "memory":
      return tooLarge.memory;
    case "targetable_goals":
      return tooLarge.goals;
    case "historical_goals":
      return tooLarge.achieved_goals;
    case "training_setup":
      return tooLarge.training_setup;
    case "planning_note":
      return tooLarge.planning_note;
    case "roadmap_to_change":
      return tooLarge.roadmap_to_change;
    case "regeneration_feedback":
      return tooLarge.regeneration_feedback;
    case "previous_proposal":
      return tooLarge.previous_proposal;
    default:
      return tooLarge.other;
  }
}
