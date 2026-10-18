"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// A `"use server"` module may export nothing but async functions, so the state
// type and its initial value live in `action-state.ts` and the client imports
// them from there directly.
import type {
  PlanProposalActionDraft,
  PlanProposalActionState,
} from "./action-state";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { REGENERATION_FEEDBACK_MAX_LENGTH } from "@/server/ai/owner-text";
import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
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
} from "@/server/ai/owner-text";
import {
  generatePlanProposal,
  previousPlanFits,
} from "@/server/plan-proposal/plan-generation";
import {
  parseExpectedPlanRevision,
  parsePlanDayCount,
  parsePlanStartDate,
  parseReplaceableSessionIds,
  parsePlanProposalId,
  parsePlanProposalItemDecision,
  parsePlanProposalItemOrdinal,
  PlanProposalValidationError,
} from "@/server/plan-proposal/plan-proposal-records";
import {
  createPlanProposalRepository,
  PlanProposalAuthenticationError,
  PlanProposalConflictError,
  PlanProposalRuleError,
} from "@/server/repositories/plan-proposal-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
  type ProfileRepository,
} from "@/server/repositories/profile-repository";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";

/**
 * The plan-proposal Server Actions.
 *
 * Every one of them authenticates first. A Server Action is a public endpoint,
 * not a private function, so the owner is derived from verified Auth claims and
 * never from anything the form carried — the owner id is not a form field here
 * and could not be, because none of the five functions accepts one.
 *
 * Two other things are deliberately not taken from the request. The owner's
 * today is read from their confirmed time zone rather than from a hidden field,
 * so a wrong or hostile value cannot move the horizon every later check is
 * measured against. And the expected plan revision, which the finish does take
 * from the form, is only ever a *stale* value in the owner's own hands: the
 * database compares it against the real revision under the same lock that
 * writes the plan, so the worst a tampered one can do is refuse the tamperer's
 * own finish.
 *
 * Nothing here formats a user-visible string. Every message comes from
 * `PLAN_PROPOSAL_COPY`, so the surface and its actions cannot drift apart in
 * wording.
 */

const OUTCOMES = PLAN_PROPOSAL_COPY.outcomes;

export async function generatePlanProposalAction(
  previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = previous.submission + 1;
  const draft: PlanProposalActionDraft = {
    startDate: text(formData, "startDate"),
    dayCount: text(formData, "dayCount"),
    planningNote: text(formData, "planningNote"),
  };

  try {
    const [owner, proposals, profiles, plan] = await Promise.all([
      createServerUserClient().then(verifyCoachAIOwner),
      createPlanProposalRepository(),
      createProfileRepository(),
      createRollingPlan(),
    ]);

    const today = await ownerToday(profiles);
    const startDate = parsePlanStartDate(draft.startDate, today);
    const dayCount = parsePlanDayCount(draft.dayCount);
    const planningNote = parsePlanningNote(draft.planningNote);
    // What the owner ticked as "can be replaced". Everything else on the
    // chosen days stays; the database decides whether each tick is allowed.
    const replaceableSessionIds = parseReplaceableSessionIds(
      formData.getAll("replaceable"),
    );

    const idempotencyKey = text(formData, "idempotencyKey");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return invalid(OUTCOMES.validation, submission, draft);
    }

    const endDate = shiftIsoDate(startDate, dayCount - 1);
    // The revision the proposal is composed against. It is recorded with the
    // attempt so a later review can say honestly how far the plan has moved,
    // and it is not what the finish revalidates — the owner is allowed to edit
    // their plan while a proposal is open.
    const slice = await plan.getPlanSlice(startDate, endDate);

    const result = await generatePlanProposal(
      {
        owner,
        startDate,
        endDate,
        dayCount,
        expectedPlanRevision: slice.revision,
        planningNote,
        idempotencyKey,
        replaceableSessionIds,
      },
      { proposals },
    );

    if (result.status === "proposal") {
      revalidatePath("/home/plan/proposal");
      return {
        status: "proposal",
        message: OUTCOMES.proposalReady,
        submission,
      };
    }
    if (result.status === "pending") {
      // The attempt under this key is already running somewhere else, so this
      // screen will never be told how it ended.
      return {
        status: "pending",
        message: OUTCOMES.generationPending,
        submission,
      };
    }
    return {
      // Only a replay of an attempt that already failed lands here; a fresh
      // failure is thrown. The key was kept on purpose (a deadline, where the
      // call may still be running), so this does not hand out a new one.
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      draft,
    };
  } catch (error) {
    return toActionState(error, submission, draft);
  }
}

export async function decidePlanProposalItemAction(
  previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = previous.submission + 1;
  try {
    const proposals = await createPlanProposalRepository();
    await proposals.decideItem(
      parsePlanProposalId(formData.get("proposalId")),
      parsePlanProposalItemOrdinal(formData.get("ordinal")),
      parsePlanProposalItemDecision(formData.get("decision")),
    );
    revalidatePath("/home/plan/proposal");
    return { status: "decided", message: OUTCOMES.itemDecided, submission };
  } catch (error) {
    return toActionState(error, submission);
  }
}

/**
 * The one action that can change the plan.
 *
 * Everything staged enters the plan together or nothing does, inside the
 * database transaction that also records the terminal decision. Both plan
 * surfaces are revalidated, because a finish that applied anything changed the
 * plan the owner will go back to.
 */
export async function finishPlanReviewAction(
  previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = previous.submission + 1;
  try {
    const proposals = await createPlanProposalRepository();
    const idempotencyKey = text(formData, "idempotencyKey");
    if (!UUID_PATTERN.test(idempotencyKey)) {
      return invalid(OUTCOMES.validation, submission);
    }

    await proposals.finishReview({
      proposalId: parsePlanProposalId(formData.get("proposalId")),
      expectedPlanRevision: parseExpectedPlanRevision(
        formData.get("expectedPlanRevision"),
      ),
      idempotencyKey,
    });

    revalidatePath("/home/plan/proposal");
    revalidatePath("/home/plan");
  } catch (error) {
    return toActionState(error, submission);
  }
  // A finished review goes to the Plan, where what it added now is (owner,
  // 17 Oct 2026). Outside the try: `redirect` throws, and the catch above
  // would turn it into an error.
  redirect("/home/plan");
}

/**
 * Ask again with what was wrong, keeping this proposal until the new one exists.
 *
 * Owner, 17 Oct 2026: a failed answer used to leave nothing, because the
 * review was closed before the coach was asked. Now nothing is written here.
 * The coach is asked with this proposal still open, and the database closes it
 * in the step that records the replacement: what the owner accepted is applied
 * then, and what they left undecided is declined, in the database.
 * When the coach fails, the owner is still on this proposal, with their
 * choices, and is told why.
 */
export async function regeneratePlanProposalAction(
  previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = previous.submission + 1;
  try {
    const [owner, proposals, profiles, plan] = await Promise.all([
      createServerUserClient().then(verifyCoachAIOwner),
      createPlanProposalRepository(),
      createProfileRepository(),
      createRollingPlan(),
    ]);

    const proposalId = parsePlanProposalId(formData.get("proposalId"));
    const feedback = parseRegenerationFeedback(
      text(formData, "regenerationFeedback"),
    );
    // A UUID made in the browser per attempt; a failed attempt gets a new one
    // (`attemptEnded`), so asking again is a new question, not a replay.
    const idempotencyKey = text(formData, "idempotencyKey");
    if (feedback === null || !UUID_PATTERN.test(idempotencyKey)) {
      return invalid(OUTCOMES.validation, submission);
    }

    const rejected = await proposals.getProposal(proposalId);
    if (rejected === null || rejected.decision !== null) {
      return invalid(OUTCOMES.validation, submission);
    }
    // Bound to a const so the narrowing survives into `askAgain` below.
    const source = rejected;
    // Refused here, before anything is reserved or paid for.
    if (!previousPlanFits(source)) {
      return invalid(OUTCOMES.regenerationTooLarge, submission);
    }

    return await askAgain();

    async function askAgain(): Promise<PlanProposalActionState> {
      const today = await ownerToday(profiles);
      const dayCount = planDayCount(source.startDate, source.endDate);
      // The days the owner asked about, unless the first has already passed:
      // then the same number of days from today, as before a start could be
      // chosen.
      const startDate = source.startDate < today ? today : source.startDate;
      const endDate = shiftIsoDate(startDate, dayCount - 1);
      const slice = await plan.getPlanSlice(startDate, endDate);

      // The marks travel to the next proposal, as the note does: the owner
      // said those sessions may go, and asking again does not take that back.
      // Only the ones that can still be replaced: a session just replaced by
      // the finish above is gone, and one logged or cancelled since would
      // refuse the whole request after the review has already closed.
      const [marked, completions] = await Promise.all([
        proposals.listReplaceableSessions(source.generationId),
        (await createCompletionLog()).findByPlanSessions(
          slice.sessions.map((session) => session.id),
        ),
      ]);
      const logged = new Set(
        completions.map((completion) => completion.planSessionId),
      );
      const stillReplaceable = new Set(
        slice.sessions
          .filter(
            (session) => session.status === "active" && !logged.has(session.id),
          )
          .map((session) => session.id),
      );
      const replaceableSessionIds = marked
        .map((mark) => mark.sessionId)
        .filter((id) => stillReplaceable.has(id));

      const result = await generatePlanProposal(
        {
          owner,
          startDate,
          endDate,
          dayCount,
          expectedPlanRevision: slice.revision,
          replaceableSessionIds,
          planningNote: source.planningNote,
          idempotencyKey: `${idempotencyKey}-regen`,
          previousProposalId: proposalId,
          regenerationFeedback: feedback,
        },
        { proposals },
      );

      revalidatePath("/home/plan/proposal");
      revalidatePath("/home/plan");

      if (result.status === "proposal") {
        return {
          status: "proposal",
          message: OUTCOMES.regenerated,
          submission,
        };
      }
      if (result.status === "pending") {
        return {
          status: "pending",
          message: OUTCOMES.generationPending,
          submission,
        };
      }
      return {
        status: "error",
        message: OUTCOMES.regenerationLost,
        submission,
        attemptEnded: true,
      };
    }
  } catch (error) {
    // The proposal is untouched, so the general copy is true for a conflict
    // or a rule. A coach that did not answer says so, and that the proposal
    // is still here; the state keeps whether the next press is a new attempt.
    const mapped = toActionState(error, submission);
    return mapped.message === OUTCOMES.generationFailed
      ? { ...mapped, message: OUTCOMES.regenerationLost }
      : mapped;
  }
}

/** Inclusive, and the same span the rejected proposal covered. */
function planDayCount(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  return Math.min(Math.max(days, 1), 7);
}

/**
 * Bounded here as well as in the database, so an over-long complaint is
 * refused before anything is closed rather than after.
 *
 * `REGENERATION_FEEDBACK_MAX_LENGTH` is the binding one: the context assembly
 * has refused over 500 characters since M3-02, and it runs *after* the review
 * has been applied. A looser bound here would let an owner type 600 characters
 * and lose their proposal to a refusal they could not have predicted.
 */
function parseRegenerationFeedback(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > REGENERATION_FEEDBACK_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

export async function discardPlanProposalAction(
  previous: PlanProposalActionState,
  formData: FormData,
): Promise<PlanProposalActionState> {
  const submission = previous.submission + 1;
  try {
    const proposals = await createPlanProposalRepository();
    await proposals.discard(parsePlanProposalId(formData.get("proposalId")));
    revalidatePath("/home/plan/proposal");
    return {
      status: "discarded",
      message: OUTCOMES.discarded,
      submission,
    };
  } catch (error) {
    return toActionState(error, submission);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function ownerToday(profiles: ProfileRepository): Promise<string> {
  const profile = await profiles.getCurrentProfile();
  const timezoneName = profile?.timezoneName;
  if (!timezoneName) {
    throw new PlanProposalRuleError("timezone-required");
  }
  return isoDateInTimezone(new Date(), timezoneName);
}

function invalid(
  message: string,
  submission: number,
  draft?: PlanProposalActionDraft,
): PlanProposalActionState {
  return { status: "validation", message, submission, draft };
}

/**
 * One error-to-outcome mapping for all four actions.
 *
 * Nothing that reaches a screen is derived from a database message. Each branch
 * is a domain error the repository raised from a code it recognized, and the
 * fallback says nothing about the cause.
 */
function toActionState(
  error: unknown,
  submission: number,
  draft?: PlanProposalActionDraft,
): PlanProposalActionState {
  if (
    error instanceof PlanProposalAuthenticationError ||
    error instanceof ProfileAuthenticationError
  ) {
    return { status: "session", message: OUTCOMES.session, submission };
  }
  if (
    error instanceof PlanProposalValidationError ||
    error instanceof OwnerTextValidationError
  ) {
    return invalid(error.message, submission, draft);
  }
  if (error instanceof PlanProposalConflictError) {
    if (error.reason === "unresolved-items") {
      return {
        status: "unresolved",
        message: OUTCOMES.unresolved,
        submission,
      };
    }
    if (error.reason === "already-finished") {
      return {
        status: "conflict",
        message: OUTCOMES.alreadyFinished,
        submission,
      };
    }
    if (error.reason === "not-available") {
      return {
        status: "conflict",
        message: OUTCOMES.notAvailable,
        submission,
      };
    }
    return { status: "conflict", message: OUTCOMES.conflict, submission };
  }
  if (error instanceof PlanProposalRuleError) {
    return {
      status: "rule",
      message:
        error.reason === "past-date"
          ? OUTCOMES.pastDate
          : error.reason === "daily-session-limit"
            ? OUTCOMES.dailyLimit
            : error.reason === "regeneration-cap"
              ? OUTCOMES.regenerationCap
              : OUTCOMES.timezoneRequired,
      submission,
    };
  }
  // Below the context minimum is not a failure and is not the coach's doing:
  // the plan operation requires an active goal and a confirmed zone, checked
  // before any key is claimed. It names what is missing, because "the coach
  // could not answer" would send the owner looking in the wrong place.
  if (error instanceof CoachAIContextBelowMinimumError) {
    const needsGoal = error.missing.includes("active_goal");
    const needsZone = error.missing.includes("resolved_timezone");
    return invalid(
      needsGoal && needsZone
        ? OUTCOMES.needsGoalAndTimezone
        : needsGoal
          ? OUTCOMES.needsGoal
          : OUTCOMES.timezoneRequired,
      submission,
      draft,
    );
  }
  // ADR-023: the two sources the owner can shorten are named, so the
  // refusal is one they can act on.
  if (error instanceof CoachAIContextTooLargeError) {
    if (error.source === "training_setup") {
      return invalid(OUTCOMES.trainingSetupTooLarge, submission, draft);
    }
    if (error.source === "targetable_goals") {
      return invalid(OUTCOMES.goalsTooLarge, submission, draft);
    }
  }
  // Any other context that is too large is the owner's own records being
  // unusable for a call, and it is reported without any detail about what the
  // context held.
  if (
    error instanceof CoachAIContextTooLargeError ||
    error instanceof CoachAIError
  ) {
    return {
      status: "error",
      message: OUTCOMES.generationFailed,
      submission,
      draft,
      // Past the deadline the provider call may still be running, so a
      // resend stays a replay of this key rather than a second charge.
      ...(isPastDeadline(error) ? {} : { attemptEnded: true as const }),
    };
  }
  return { status: "error", message: OUTCOMES.error, submission, draft };
}

function isPastDeadline(error: unknown): boolean {
  return error instanceof CoachAIError && error.code === "deadline_exceeded";
}
