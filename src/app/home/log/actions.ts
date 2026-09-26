"use server";

import { revalidatePath } from "next/cache";

import {
  TRAINED_OUTCOMES,
  type CompletionOutcome,
  type LogActionState,
} from "./log-action-state";

import {
  CompletionConflictError,
  CompletionDuplicateError,
  CompletionFutureDateError,
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
    // The day the record now sits on, which is where it can be seen. Moving a
    // log to another day and being returned to the day it left is a small lie
    // about where the training went.
    const returnDate = facts.actualLocalDate as string;
    const log = await createCompletionLog();

    // Every log carries its own name and restates its whole activity list,
    // planned or not. What a planned log was measured against is captured by
    // the write function from the plan row, and no edit ever writes it.
    const content = {
      ...readName(formData, editing),
      activities: readActualActivities(formData, "activities"),
      ...(facts.status === "replaced" ? readReplacedBy(formData, editing) : {}),
    };

    if (editing) {
      const receipt = await log.applyChange({
        operation: "edit",
        completionId: formData.get("completionId"),
        expectedRevision: readInteger(formData.get("expectedRevision")),
        completion: { ...facts, ...content },
      });
      // Today only. Revalidating this route would re-render the page the owner
      // is standing on, and the write they just made would turn it into the
      // "already logged" notice in place of their receipt.
      revalidatePath("/home/today");
      return result("saved", "Log updated.", {
        result: receipt.result,
        returnDate,
      });
    }

    const plannedSessionId = optionalText(formData, "plannedSessionId");
    // Training done on another day than planned is either the planned session
    // done early or late, or extra training with the planned one still ahead.
    // The owner decided on 26 Sep 2026 that the form asks. "Extra" is written
    // as unplanned training: no link to the plan, so the planned session stays
    // open, and no activity claims to answer one of its activities.
    const extra =
      plannedSessionId !== undefined && formData.get("dayChoice") === "extra";
    if (extra && !TRAINED_OUTCOMES.has(facts.status as CompletionOutcome)) {
      throw new CompletionValidationError();
    }
    if (plannedSessionId !== undefined && !extra) {
      await assertSessionOnDay(
        plannedSessionId,
        requiredDate(formData.get("plannedDate")),
      );
    }
    const unplanned = plannedSessionId === undefined || extra;
    const receipt = await log.applyChange({
      operation: "create",
      completion: {
        ...facts,
        ...(extra ? { status: "unplanned" } : {}),
        ...(unplanned ? {} : { planSessionId: plannedSessionId }),
        ...content,
        ...(extra ? { activities: unlinkFromPlan(content.activities) } : {}),
      },
    });
    revalidatePath("/home/today");
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
    if (error instanceof CompletionDuplicateError) {
      return result(
        "conflict",
        "That session already has a log. Open it from Today to correct it.",
        { conflict: "duplicate" },
      );
    }
    if (error instanceof CompletionFutureDateError) {
      return result(
        "validation",
        editing
          ? "Training cannot be dated in the future. Nothing was changed."
          : "Training cannot be dated in the future. Nothing was logged.",
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
 * The name the owner gave the training, which is the log's own. A planned log
 * arrives prefilled with the plan's; changing it never reaches the plan.
 */
function readName(formData: FormData, editing: boolean) {
  const nothing = editing ? "Nothing was changed." : "Nothing was logged.";
  return {
    title: readActivityText(formData, "title", 120, {
      missing: `Give this training a title, then save again. ${nothing}`,
      tooLong: `Shorten the title to 120 characters or fewer, then save again. ${nothing}`,
    }),
    sport: readActivityText(formData, "sport", 80, {
      missing: `Name the sport, then save again. ${nothing}`,
      tooLong: `Shorten the sport to 80 characters or fewer, then save again. ${nothing}`,
    }),
  };
}

/**
 * The actual activities of a log, decoded and nothing more. The shape,
 * the measurement against its mode, and the position rules are the domain's
 * to judge - `parseCompletionChange` runs on this list before anything is
 * written - so this file does not repeat them.
 *
 * An absent field is an empty list rather than a refusal. Skipped and replaced
 * logs send none - the form disables the list - so a correction to either
 * clears the actuals, which the form says before saving. A log that recorded
 * nothing per activity is still a true record.
 */
function readActualActivities(formData: FormData, key: string): unknown {
  const raw = formData.get(key);
  if (raw === null) return [];
  if (typeof raw !== "string") throw new CompletionValidationError();
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CompletionValidationError();
  }
}

/**
 * Actual activities with their link to the planned activity they answered
 * removed, for training recorded as unplanned. Anything that is not a list of
 * records is handed on untouched for the domain to refuse.
 */
function unlinkFromPlan(activities: unknown): unknown {
  if (!Array.isArray(activities)) return activities;
  return activities.map((activity: unknown) => {
    if (typeof activity !== "object" || activity === null) return activity;
    const { plannedPosition, ...rest } = activity as Record<string, unknown>;
    void plannedPosition;
    return rest;
  });
}

/**
 * What a replaced log points at: training the owner already logged, or the
 * training logged in this same save. Which one is the form's `replacementMode`;
 * the rest is decoded and handed on, and the domain decides whether it is a
 * valid pointer or valid unplanned training.
 */
function readReplacedBy(formData: FormData, editing: boolean) {
  if (formData.get("replacementMode") === "existing") {
    return {
      replacedByCompletionId: readText(formData.get("replacedByCompletionId")),
    };
  }
  const nothing = editing ? "Nothing was changed." : "Nothing was logged.";
  const feeling = optionalText(formData, "replacement.feeling");
  return {
    replacement: {
      title: readActivityText(formData, "replacement.title", 120, {
        missing: `Name what you did instead, then save again. ${nothing}`,
        tooLong: `Shorten what you did instead to 120 characters or fewer, then save again. ${nothing}`,
      }),
      sport: readActivityText(formData, "replacement.sport", 80, {
        missing: `Name the sport of what you did instead, then save again. ${nothing}`,
        tooLong: `Shorten its sport to 80 characters or fewer, then save again. ${nothing}`,
      }),
      ...renamed(
        optionalNumber(formData, "replacement.durationMinutes"),
        "durationMinutes",
      ),
      ...renamed(
        optionalNumber(formData, "replacement.perceivedEffort"),
        "perceivedEffort",
      ),
      ...(feeling === undefined ? {} : { feeling }),
      activities: readActualActivities(formData, "replacement.activities"),
    },
  };
}

/** `optionalNumber` keys its result by the field; the payload wants its own. */
function renamed(value: Record<string, number>, key: string) {
  const [number] = Object.values(value);
  return number === undefined ? {} : { [key]: number };
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
