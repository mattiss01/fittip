"use server";

import { revalidatePath } from "next/cache";

import { type LogActionState } from "./log-action-state";

import {
  CompletionConflictError,
  CompletionPersistenceError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
} from "@/server/completions/completion-log";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";

/**
 * The one write this surface makes. It reaches persistence only through
 * `createCompletionLog()`, which is M3-15A's accepted seam, and it never
 * composes a plan change: `skipped` is a fact about what happened, so it is
 * written as a completion status like any other and never reaches
 * `apply_rolling_plan_change_set`.
 *
 * A create names the planned session; an edit names the record and the
 * revision the owner read. Neither ever sends a planned snapshot - the write
 * function captures that from the plan row itself, so no caller can forge one.
 */
export async function logCompletionAction(
  previous: LogActionState,
  formData: FormData,
): Promise<LogActionState> {
  const result = (
    status: LogActionState["status"],
    message: string,
    extra: Partial<LogActionState> = {},
  ): LogActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    ...extra,
  });

  const operation = formData.get("operation");
  const editing = operation === "edit";

  try {
    if (operation !== "create" && operation !== "edit") {
      throw new CompletionValidationError();
    }
    const facts = readFacts(formData);
    const returnDate =
      optionalDate(formData.get("returnDate")) ??
      (facts.actualLocalDate as string);
    const log = await createCompletionLog();

    if (editing) {
      const receipt = await log.applyChange({
        operation: "edit",
        completionId: formData.get("completionId"),
        expectedRevision: readInteger(formData.get("expectedRevision")),
        completion: facts,
      });
      revalidatePath("/home/today");
      revalidatePath("/home/log");
      return result("saved", "Log updated.", {
        result: receipt.result,
        returnDate,
      });
    }

    const plannedSessionId = optionalText(formData, "plannedSessionId");
    if (plannedSessionId !== undefined) {
      await assertSessionOnDay(
        plannedSessionId,
        requiredDate(formData.get("plannedDate")),
      );
    }
    const unplanned = plannedSessionId === undefined;
    const receipt = await log.applyChange({
      operation: "create",
      completion: {
        ...facts,
        ...(unplanned ? {} : { planSessionId: plannedSessionId }),
        // A planned log is already named by the snapshot the write function
        // captures from the plan row, so its list stays empty: no activity
        // editor and no actual-measurement capture exists. Unplanned training
        // has no planned side at all, so the title and sport the owner typed
        // are written as its one activity, which is the only place a name for
        // it can live.
        activities: unplanned ? [readUnplannedActivity(formData)] : [],
      },
    });
    revalidatePath("/home/today");
    revalidatePath("/home/log");
    return result("saved", "Log saved.", {
      result: receipt.result,
      returnDate,
    });
  } catch (error) {
    if (error instanceof CompletionConflictError) {
      return result(
        "conflict",
        "This log changed somewhere else, or is no longer there. Reload before saving.",
        { conflict: "stale" },
      );
    }
    if (error instanceof CompletionTimezoneRequiredError) {
      return result(
        "conflict",
        "Confirm your time zone on the Plan before logging training.",
        { conflict: "timezone" },
      );
    }
    if (error instanceof LogFieldError) {
      return result("validation", error.message);
    }
    if (error instanceof CompletionValidationError) {
      return result(
        "validation",
        editing
          ? "Check the outcome, the date, and the numbers. Nothing was changed."
          : "Check the outcome, the date, and the numbers. Nothing was logged.",
      );
    }
    if (
      error instanceof CompletionAuthenticationError ||
      error instanceof RollingPlanAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended. Sign in again before logging training.",
      );
    }
    if (error instanceof CompletionPersistenceError) {
      return result(
        "error",
        "The log could not be confirmed. Reload the day and check before writing it again.",
      );
    }
    return result("error", "The log could not be saved.");
  }
}

/**
 * The one activity an unplanned log carries. It is not the start of an
 * activity editor: there is exactly one, at position 0, with no personal
 * activity linked and no measurement captured, so nothing here creates or
 * implies an exercise library. `custom` is the measurement mode that records
 * no measured value, which is what an untimed free-text entry is.
 */
function readUnplannedActivity(formData: FormData) {
  return {
    position: 0,
    name: readActivityText(formData, "title", 120, {
      missing:
        "Give this training a title, then save again. Nothing was logged.",
      tooLong:
        "Shorten the title to 120 characters or fewer, then save again. Nothing was logged.",
    }),
    sport: readActivityText(formData, "sport", 80, {
      missing: "Name the sport, then save again. Nothing was logged.",
      tooLong:
        "Shorten the sport to 80 characters or fewer, then save again. Nothing was logged.",
    }),
    measurementMode: "custom" as const,
  };
}

/**
 * Trimmed and length-checked here as well as in the domain and the database,
 * so the owner is told which field is wrong rather than that the completion
 * is. Missing and too long are separate messages: an empty field is the far
 * likelier mistake, and a length limit is not an answer to it.
 */
function readActivityText(
  formData: FormData,
  key: string,
  max: number,
  messages: { missing: string; tooLong: string },
): string {
  const value = optionalText(formData, key);
  if (value === undefined) throw new LogFieldError(messages.missing);
  if (value.length > max) throw new LogFieldError(messages.tooLong);
  return value;
}

/** A field the owner can see and fix, reported in the words of that field. */
class LogFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogFieldError";
  }
}

/**
 * A pre-check, not an access control. Ownership is enforced by Row Level
 * Security, by the owner-scoped slice this reads, and by the write function
 * re-deriving the owner; this adds to none of them, because the date it bounds
 * by is the caller's own `plannedDate` and so confines nothing the caller does
 * not already choose. What it buys is copy: a session moved or deleted between
 * opening the form and saving is reported as that, rather than as the generic
 * validation failure a foreign-key violation would surface.
 */
async function assertSessionOnDay(sessionId: string, localDate: string) {
  const slice = await (
    await createRollingPlan()
  ).getPlanSlice(localDate, localDate);
  if (!slice.sessions.some((session) => session.id === sessionId)) {
    throw new CompletionValidationError();
  }
}

/**
 * Exactly the keys `CompletionFacts` carries and nothing else. The domain
 * refuses an unknown key outright, so an extra field here would be rejected
 * rather than silently stored.
 */
function readFacts(formData: FormData): Record<string, unknown> {
  const feeling = optionalText(formData, "feeling");
  const note = optionalText(formData, "note");
  const replacement = optionalText(formData, "replacementDescription");
  return {
    status: readText(formData.get("status")),
    actualLocalDate: requiredDate(formData.get("actualLocalDate")),
    ...optionalNumber(formData, "durationMinutes"),
    ...optionalNumber(formData, "perceivedEffort"),
    ...(feeling === undefined ? {} : { feeling }),
    ...(note === undefined ? {} : { note }),
    ...(replacement === undefined
      ? {}
      : { replacementDescription: replacement }),
    painReported: readFlag(formData.get("painReported")),
    illnessReported: readFlag(formData.get("illnessReported")),
    injuryReported: readFlag(formData.get("injuryReported")),
    severeFatigueReported: readFlag(formData.get("severeFatigueReported")),
  };
}

function optionalNumber(formData: FormData, key: string) {
  const value = optionalText(formData, key);
  if (value === undefined) return {};
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new CompletionValidationError();
  return { [key]: parsed };
}

function readFlag(value: FormDataEntryValue | null): boolean {
  return value === "true";
}

function readInteger(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CompletionValidationError();
  }
  return parsed;
}

function readText(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") throw new CompletionValidationError();
  return value;
}

function requiredDate(value: FormDataEntryValue | null): string {
  const date = optionalDate(value);
  if (date === undefined) throw new CompletionValidationError();
  return date;
}

function optionalDate(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return undefined;
  }
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
