"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  type PlanActionDraft,
  type PlanActionState,
  type PlanOperation,
  type TimezoneActionState,
} from "./action-state";
import {
  nextPlanPosition,
  readPlannableDate,
  readPlanWindow,
  type PlanWindow,
} from "./plan-window";
import {
  planChangeCopy,
  topUpAfterPlanChange,
  type PlanTopUpResult,
} from "./series-materialization";

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
    const refill =
      operation === "delete"
        ? await occurrenceRefill(
            plan,
            deletedOccurrence(slice, formData),
            topUp,
          )
        : "none";

    revalidatePath("/home/plan");
    return result(
      "saved",
      planChangeCopy(
        deleteCopy(refill) ?? savedCopy(operation, formData),
        topUp,
      ),
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

/**
 * Whether the top-up put a just-deleted occurrence straight back.
 *
 * Materialization coverage is "a row exists for this series and rule date", so
 * deleting an occurrence uncovers its date and the top-up that follows every
 * plan change refills it in the same request. The product owner accepted that
 * on 29 August 2026 rather than withhold delete from an occurrence, which
 * leaves the surface one obligation: not to report "Session deleted." over a
 * session the owner can still see.
 *
 * The receipt counts what was created but never says which dates, and one
 * top-up can serve more than one series, so the count alone cannot answer this.
 * One bounded single-date read can. It is reached only when a delete was
 * followed by a top-up that actually created something, so the ordinary delete
 * pays nothing for it.
 */
type OccurrenceRefill = "none" | "restored" | "unknown";

function deletedOccurrence(
  slice: RollingPlanSlice,
  formData: FormData,
): RollingPlanSession | undefined {
  const sessionId = formData.get("sessionId");
  return slice.sessions.find((candidate) => candidate.id === sessionId);
}

async function occurrenceRefill(
  plan: Awaited<ReturnType<typeof createRollingPlan>>,
  deleted: RollingPlanSession | undefined,
  topUp: PlanTopUpResult,
): Promise<OccurrenceRefill> {
  const occurrenceDate = deleted?.occurrenceDate;
  if (
    !deleted ||
    deleted.seriesId === null ||
    occurrenceDate === null ||
    occurrenceDate === undefined ||
    !topUp.ok ||
    topUp.receipt.createdCount === 0
  ) {
    return "none";
  }
  try {
    const refreshed = await plan.getPlanSlice(occurrenceDate, occurrenceDate);
    return refreshed.sessions.some(
      (candidate) =>
        candidate.seriesId === deleted.seriesId &&
        candidate.occurrenceDate === occurrenceDate,
    )
      ? "restored"
      : "none";
  } catch {
    // The delete itself is already permanent. What is unknown is only whether
    // the series wrote the date back, so the owner is told that much rather
    // than told the plan change failed.
    return "unknown";
  }
}

function deleteCopy(refill: OccurrenceRefill): string | undefined {
  if (refill === "restored") {
    return "Session deleted, then written back by its recurring series. End the series from this date to stop it returning.";
  }
  if (refill === "unknown") {
    return "Session deleted. Its recurring series may have written the date back. Reload to see the plan as saved.";
  }
  return undefined;
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
          activities: [],
        },
      },
    ];
  }

  // A cancelled session is a legitimate target for a delete and for nothing
  // else: it is exactly what an owner may next want gone.
  const session = requireSession(
    slice,
    formData.get("sessionId"),
    operation === "delete",
  );
  if (operation === "edit") {
    return [
      {
        operation,
        sessionId: session.id,
        session: {
          ...readContent(formData),
          // This surface plans sessions, not their activities. The change
          // function replaces the whole activity list on an edit, so the
          // current one is carried through unchanged rather than erased.
          activities: session.activities.map(({ id, ...activity }) => {
            void id;
            return activity;
          }),
        },
      },
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
  };
  return copy[operation] ?? "Plan change saved.";
}
