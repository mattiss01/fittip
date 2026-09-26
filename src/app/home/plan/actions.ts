"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  type PlanActionDraft,
  type PlanActionState,
  type PlanOperation,
  type TimezoneActionState,
} from "./action-state";
import { readSubmittedActivities } from "./activity-form";
import {
  nextPlanPosition,
  readPlannableDate,
  readPlanWindow,
  type PlanWindow,
} from "./plan-window";
import { planChangeCopy, topUpAfterPlanChange } from "./series-materialization";

import {
  createProfileRepository,
  ProfileAuthenticationError,
  ProfileValidationError,
} from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import {
  RollingPlanConflictError,
  RollingPlanPersistenceError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type RollingPlanActivityInput,
  type RollingPlanChange,
  type RollingPlanSession,
  type RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";

const OPERATIONS: readonly PlanOperation[] = [
  "add",
  "edit",
  "move",
  "duplicate",
  "set_lock",
  "cancel",
  "delete",
  "reactivate",
  "set_recovery_day",
];

/**
 * The planning rules this surface can actually break, in the surface's own
 * words. A series rule cannot reach here - M3-14B owns the surface that
 * composes one - so forwarding an unknown reason under this wording would tell
 * the owner something untrue, and the caller checks the reason first.
 */
const RULE_COPY = {
  "past-date": "That date has already passed. Plan today or a later date.",
  "daily-session-limit":
    "A date holds at most ten sessions. Cancel or move one first.",
  "session-completed":
    "You have logged training against this session, so it cannot be deleted. Cancel it instead to keep the record.",
} as const;

export async function confirmPlanTimezoneAction(
  previous: TimezoneActionState,
  formData: FormData,
): Promise<TimezoneActionState> {
  const submission = previous.submission + 1;
  try {
    const repository = await createProfileRepository();
    await repository.confirmTimezone(formData.get("timezoneName"));
    revalidatePath("/home/plan");
    return { status: "saved", message: "Time zone confirmed.", submission };
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return {
        status: "validation",
        message:
          "That time zone was not recognized. Pick your zone and try again.",
        submission,
      };
    }
    if (error instanceof ProfileAuthenticationError) {
      return {
        status: "session",
        message: "Your session ended. Sign in again before planning.",
        submission,
      };
    }
    return {
      status: "error",
      message: "The time zone could not be saved. Reload and try again.",
      submission,
    };
  }
}

export async function changePlanAction(
  previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const operation = readOperation(formData.get("operation"));
  const sessionId = optionalText(formData, "sessionId");
  const localDate = optionalText(formData, "localDate");
  const draft =
    operation === "add" || operation === "edit"
      ? draftFrom(formData)
      : undefined;
  const result = (
    status: PlanActionState["status"],
    message: string,
    conflict?: PlanActionState["conflict"],
  ): PlanActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation,
    sessionId,
    localDate,
    draft: status === "saved" ? undefined : draft,
    conflict,
  });

  try {
    if (!operation) throw new RollingPlanValidationError();
    const expectedRevision = readInteger(formData.get("expectedRevision"));
    const plan = await createRollingPlan();
    const window = await readPlanWindow();
    const slice = await plan.getPlanSlice(window.today, window.lastDate);
    if (slice.revision !== expectedRevision) {
      throw new RollingPlanConflictError();
    }

    const changes = buildChanges(operation, formData, slice, window);
    // Only an edit can compose nothing: both its halves are conditional, so a
    // save on a form the owner opened and left alone has no change to send.
    // The change function refuses an empty set, and being told the plan is
    // invalid for pressing Save on an unchanged form would be a lie about
    // what happened.
    if (changes.length === 0) {
      return result("saved", "Nothing had changed, so nothing was saved.");
    }
    await assertOccurrencePlacements(plan, slice, changes);
    const receipt = await plan.applyChangeSet(
      {
        idempotencyKey: randomUUID(),
        provenance: "owner_manual",
        changes,
      },
      expectedRevision,
    );
    const topUp = await topUpAfterPlanChange(plan, receipt.planRevision);

    revalidatePath("/home/plan");
    // M3-16B: the review surface renders the same sessions, and an edit made
    // from inside a review has to show there too. Naming both paths rather than
    // taking a return path from the form keeps the action's reach fixed at two
    // routes this file names, instead of one a caller supplies.
    revalidatePath("/home/plan/proposal");
    return result(
      "saved",
      planChangeCopy(savedCopy(operation, formData), topUp),
    );
  } catch (error) {
    if (error instanceof RollingPlanRuleError) {
      if (
        error.reason === "past-date" ||
        error.reason === "daily-session-limit" ||
        error.reason === "session-completed"
      ) {
        return result("rule", RULE_COPY[error.reason], error.reason);
      }
    }
    if (error instanceof RollingPlanConflictError) {
      return result(
        "conflict",
        "Your plan changed somewhere else. Reload before trying this change again.",
        "stale",
      );
    }
    if (error instanceof RollingPlanTimezoneRequiredError) {
      return result(
        "conflict",
        "Confirm your time zone before changing your plan.",
        "timezone",
      );
    }
    if (error instanceof RollingPlanValidationError) {
      return result(
        "validation",
        "Check the session details and the date. Your change has not been saved.",
      );
    }
    if (
      error instanceof RollingPlanAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended. Sign in again before changing your plan.",
      );
    }
    if (error instanceof RollingPlanPersistenceError) {
      return result(
        "error",
        "The plan change could not be confirmed. Reload and try again.",
      );
    }
    return result("error", "The plan change could not be completed.");
  }
}

async function assertOccurrencePlacements(
  plan: Awaited<ReturnType<typeof createRollingPlan>>,
  slice: RollingPlanSlice,
  changes: RollingPlanChange[],
) {
  const moves = changes.filter(
    (change): change is Extract<RollingPlanChange, { operation: "move" }> =>
      change.operation === "move",
  );
  if (moves.length === 0) return;
  const occurrenceMoves = moves.filter((move) => {
    const session = requireSession(slice, move.sessionId);
    return session.seriesId !== null;
  });
  if (occurrenceMoves.length === 0) return;
  const series = await plan.listSeries();
  for (const move of occurrenceMoves) {
    const session = requireSession(slice, move.sessionId);
    if (session.seriesId === null) continue;
    const segment = series.find(
      (candidate) => candidate.id === session.seriesId,
    );
    if (
      !segment ||
      move.localDate < segment.startDate ||
      (segment.endDate !== undefined && move.localDate > segment.endDate)
    ) {
      throw new RollingPlanValidationError();
    }
  }
}

function buildChanges(
  operation: PlanOperation,
  formData: FormData,
  slice: RollingPlanSlice,
  window: PlanWindow,
): RollingPlanChange[] {
  if (operation === "set_recovery_day") {
    return [
      {
        operation,
        localDate: readPlannableDate(formData.get("localDate"), window),
        isRecoveryDay: readBoolean(formData.get("isRecoveryDay")),
      },
    ];
  }
  if (operation === "add") {
    const localDate = readPlannableDate(formData.get("localDate"), window);
    return [
      {
        operation,
        sessionId: randomUUID(),
        session: {
          ...readContent(formData),
          localDate,
          position: nextPlanPosition(slice, localDate),
          isLocked: false,
          activities: readSubmittedActivities(formData),
        },
      },
    ];
  }

  // A cancelled session is a legitimate target for a delete or a reactivate
  // and for nothing else: it is what an owner may next want gone, or back.
  const session = requireSession(
    slice,
    formData.get("sessionId"),
    operation === "delete" || operation === "reactivate",
  );
  if (operation === "edit") {
    // The edit form owns the date now, so a date change arrives as part of an
    // edit rather than through a section of its own. The contract keeps them
    // apart — `edit` carries content, `move` carries a date and a position —
    // so this composes both into one change set, which succeeds or fails as
    // one action. The move is appended only when the date actually changed: a
    // move to where the session already is would be refused as a change that
    // changes nothing, and would take the edit down with it.
    const requestedDate = formData.get("localDate");
    const moved =
      typeof requestedDate === "string" && requestedDate !== session.localDate
        ? readPlannableDate(requestedDate, window)
        : null;
    const content = {
      ...readContent(formData),
      // The change function replaces the whole list on an edit, and the editor
      // submits the whole list, so this is a replacement by design: a row the
      // owner removed is gone because it is absent here. A form that somehow
      // sent no field at all would therefore erase the list, which is why
      // `readSubmittedActivities` refuses a missing field rather than reading it as an
      // empty one.
      activities: readSubmittedActivities(formData),
    };
    // Each half is sent only when it has something to do, because the change
    // function refuses any single change that would leave the state as it
    // found it — and one refusal takes the whole set with it. Moving a session
    // without touching its content is the ordinary case now that the date is a
    // field on this form, and it was sending an edit that changed nothing
    // alongside it, so nothing moved at all.
    const edited = sessionFingerprint(content) !== sessionFingerprint(session);
    return [
      ...(edited
        ? [{ operation, sessionId: session.id, session: content }]
        : []),
      ...(moved === null
        ? []
        : [
            {
              operation: "move" as const,
              sessionId: session.id,
              localDate: moved,
              position: nextPlanPosition(slice, moved),
            },
          ]),
    ];
  }
  if (operation === "move") {
    const localDate = readPlannableDate(formData.get("localDate"), window);
    return [
      {
        operation,
        sessionId: session.id,
        localDate,
        position: nextPlanPosition(slice, localDate),
      },
    ];
  }
  if (operation === "duplicate") {
    const localDate = readPlannableDate(formData.get("localDate"), window);
    // A copy of the content under a new identity. It carries no lock and no
    // history, and the owner chooses its date.
    return [
      {
        operation: "add",
        sessionId: randomUUID(),
        session: {
          title: session.title,
          sport: session.sport,
          ...(session.intent === undefined ? {} : { intent: session.intent }),
          ...(session.expectedDurationMinutes === undefined
            ? {}
            : { expectedDurationMinutes: session.expectedDurationMinutes }),
          ...(session.note === undefined ? {} : { note: session.note }),
          localDate,
          position: nextPlanPosition(slice, localDate),
          isLocked: false,
          activities: session.activities.map(({ id, ...activity }) => {
            void id;
            return activity;
          }),
        },
      },
    ];
  }
  if (operation === "set_lock") {
    return [
      {
        operation,
        sessionId: session.id,
        isLocked: readBoolean(formData.get("isLocked")),
      },
    ];
  }
  if (operation === "cancel") {
    return [{ operation, sessionId: session.id }];
  }
  if (operation === "reactivate") {
    if (session.status !== "cancelled") throw new RollingPlanValidationError();
    return [{ operation, sessionId: session.id }];
  }
  return [{ operation: "delete", sessionId: session.id }];
}

function requireSession(
  slice: RollingPlanSlice,
  value: FormDataEntryValue | null,
  includeCancelled = false,
): RollingPlanSession {
  const session = slice.sessions.find(
    (candidate) =>
      candidate.id === value &&
      (candidate.status === "active" ||
        (includeCancelled && candidate.status === "cancelled")),
  );
  if (!session) throw new RollingPlanValidationError();
  return session;
}

function readContent(formData: FormData) {
  const minutes = optionalText(formData, "expectedDurationMinutes");
  return {
    title: text(formData, "title"),
    sport: text(formData, "sport"),
    ...(optionalText(formData, "intent") === undefined
      ? {}
      : { intent: text(formData, "intent").trim() }),
    ...(minutes === undefined
      ? {}
      : { expectedDurationMinutes: readMinutes(minutes) }),
    ...(optionalText(formData, "note") === undefined
      ? {}
      : { note: text(formData, "note").trim() }),
  };
}

/**
 * One comparable string for a session's content, so "did the owner change
 * anything?" is a question this file can answer before the database is asked.
 *
 * It exists because `apply_rolling_plan_change_set` refuses a change that
 * leaves the state as it found it, and refuses the whole set with it. Since
 * the date moved onto the edit form, saving a session on a new date without
 * retyping its title composes an edit that changes nothing beside a move that
 * does — and the pair was refused, so the session stayed where it was.
 *
 * Both sides go through the same normalizer because they arrive differently:
 * a form omits a key it has no value for, and a record carries an explicit
 * null. Comparing them raw would call every save a change.
 */
type FingerprintableSession = Pick<
  RollingPlanSession,
  "title" | "sport" | "intent" | "expectedDurationMinutes" | "note"
> & {
  /** The stored side carries an `id` the submitted side has no reason to. */
  activities: readonly (RollingPlanActivityInput & { id?: string })[];
};

function sessionFingerprint(content: FingerprintableSession): string {
  return JSON.stringify({
    title: content.title,
    sport: content.sport,
    intent: content.intent ?? null,
    expectedDurationMinutes: content.expectedDurationMinutes ?? null,
    note: content.note ?? null,
    activities: content.activities.map((activity) => ({
      personalActivityId: activity.personalActivityId ?? null,
      position: activity.position,
      name: activity.name,
      sport: activity.sport,
      instructions: activity.instructions ?? null,
      measurementMode: activity.measurementMode,
      target: activity.target ?? null,
      isLocked: activity.isLocked,
    })),
  });
}

function readOperation(value: FormDataEntryValue | null) {
  return OPERATIONS.find((operation) => operation === value);
}

function readBoolean(value: FormDataEntryValue | null): boolean {
  if (value !== "true" && value !== "false")
    throw new RollingPlanValidationError();
  return value === "true";
}

function readInteger(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new RollingPlanValidationError();
  return parsed;
}

function readMinutes(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RollingPlanValidationError();
  return parsed;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new RollingPlanValidationError();
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function draftFrom(formData: FormData): PlanActionDraft {
  return {
    title: stringValue(formData.get("title")),
    sport: stringValue(formData.get("sport")),
    intent: stringValue(formData.get("intent")),
    expectedDurationMinutes: stringValue(
      formData.get("expectedDurationMinutes"),
    ),
    note: stringValue(formData.get("note")),
  };
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function savedCopy(operation: PlanOperation, formData: FormData): string {
  if (operation === "set_lock") {
    return formData.get("isLocked") === "true"
      ? "Session locked."
      : "Session unlocked.";
  }
  if (operation === "set_recovery_day") {
    return formData.get("isRecoveryDay") === "true"
      ? "Recovery day set."
      : "Recovery day cleared.";
  }
  const copy: Record<string, string> = {
    add: "Session added.",
    edit: "Session updated.",
    move: "Session moved.",
    duplicate: "Session duplicated.",
    cancel: "Session cancelled.",
    delete: "Session deleted.",
    reactivate: "Session reactivated.",
  };
  return copy[operation] ?? "Plan change saved.";
}
