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
    const receipt = await log.applyChange({
      operation: "create",
      completion: {
        ...facts,
        ...(plannedSessionId === undefined
          ? {}
          : { planSessionId: plannedSessionId }),
        // No activity editor and no actual-measurement capture exists yet, so
        // the list is deliberately empty rather than invented.
        activities: [],
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
 * The planned session must actually sit on the day the form was opened for.
 * Row Level Security and the write function both confine this to the owner
 * already; this repeats the ownership predicate at the surface and bounds the
 * lookup by the one date, so a forged id cannot be probed against the whole
 * plan.
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
