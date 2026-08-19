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
  "set_recovery_day",
];

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

    await plan.applyChangeSet(
      {
        idempotencyKey: randomUUID(),
        provenance: "owner_manual",
        changes: buildChanges(operation, formData, slice, window),
      },
      expectedRevision,
    );

    revalidatePath("/home/plan");
    return result("saved", savedCopy(operation, formData));
  } catch (error) {
    if (error instanceof RollingPlanRuleError) {
      // This action composes no series change, so a series rule cannot reach
      // here. M3-14B owns the surface that can produce one, and its own copy
      // for it; forwarding an unknown reason under this action's wording would
      // tell the owner something untrue.
      if (
        error.reason === "past-date" ||
        error.reason === "daily-session-limit"
      ) {
        return result(
          "rule",
          error.reason === "past-date"
            ? "That date has already passed. Plan today or a later date."
            : "A date holds at most ten sessions. Cancel or move one first.",
          error.reason,
        );
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

  const session = requireSession(slice, formData.get("sessionId"));
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
  return [{ operation: "cancel", sessionId: session.id }];
}

function requireSession(
  slice: RollingPlanSlice,
  value: FormDataEntryValue | null,
): RollingPlanSession {
  const session = slice.sessions.find(
    (candidate) => candidate.id === value && candidate.status === "active",
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
  };
  return copy[operation] ?? "Plan change saved.";
}
