"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  type MaterializeActionState,
  type SeriesActionState,
  type SeriesOperation,
} from "./series-action-state";
import { planChangeCopy, topUpAfterPlanChange } from "./series-materialization";
import { seriesOccurrenceDates } from "./series-recurrence";
import { readPlanWindow } from "./plan-window";

import { shiftIsoDate } from "@/lib/date/local-date";
import { ProfileAuthenticationError } from "@/server/repositories/profile-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import {
  createSavedSessionLibrary,
  SavedSessionAuthenticationError,
} from "@/server/repositories/saved-session-repository";
import {
  RollingPlanConflictError,
  RollingPlanPersistenceError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type RollingPlanChange,
  type RollingPlanSeries,
  type RollingPlanSeriesInput,
  type RollingPlanSession,
  type RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";
import {
  plannedSessionToRollingPlanSeriesInput,
  toRollingPlanSeriesInput,
  type RollingPlanRecurrenceRule,
} from "@/server/saved-sessions/session-copy";

const OPERATIONS: readonly SeriesOperation[] = [
  "add_series",
  "edit_series",
  "end_series",
];

export async function changeSeriesAction(
  previous: SeriesActionState,
  formData: FormData,
): Promise<SeriesActionState> {
  const operation = readOperation(formData.get("operation"));
  const sessionId = optionalText(formData, "sessionId");
  const result = (
    status: SeriesActionState["status"],
    message: string,
    extra: Partial<SeriesActionState> = {},
  ): SeriesActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation,
    sessionId,
    ...extra,
  });

  try {
    if (!operation) throw new RollingPlanValidationError();
    const expectedRevision = readInteger(formData.get("expectedRevision"));
    const window = await readPlanWindow();
    const plan = await createRollingPlan();
    const [slice, series] = await Promise.all([
      plan.getPlanSlice(window.today, window.lastDate),
      plan.listSeries(),
    ]);
    if (slice.revision !== expectedRevision) {
      throw new RollingPlanConflictError();
    }

    const change = await buildSeriesChange(
      operation,
      formData,
      slice,
      series,
      window.today,
      window.lastDate,
    );
    const receipt = await plan.applyChangeSet(
      {
        idempotencyKey: randomUUID(),
        provenance: "owner_series",
        changes: [change],
      },
      expectedRevision,
    );
    const topUp = await topUpAfterPlanChange(plan, receipt.planRevision);
    revalidatePath("/home/plan");

    if (operation === "end_series") {
      if (change.operation !== "end_series") {
        throw new RollingPlanPersistenceError();
      }
      const effect = receipt.seriesEffects.find(
        (candidate) =>
          candidate.operation === "end_series" &&
          candidate.seriesId === change.seriesId,
      );
      if (!effect) throw new RollingPlanPersistenceError();
      return result(
        "saved",
        planChangeCopy(
          `Future recurring sessions removed permanently: ${effect.deleted} unchanged removed, ${effect.divergedDeleted} changed removed, ${effect.lockedKept} locked kept. Nothing before this session or in completed training changed.`,
          topUp,
        ),
        { effect },
      );
    }

    const topUpReceipt = topUp.ok ? topUp.receipt : undefined;
    return result(
      "saved",
      planChangeCopy(
        operation === "add_series"
          ? "Recurring series created. The Plan now shows every occurrence that fit in the current window."
          : "This and future sessions changed. Earlier occurrences and completed training are unchanged.",
        topUp,
      ),
      {
        skipped: topUpReceipt?.skipped,
      },
    );
  } catch (error) {
    if (error instanceof RollingPlanRuleError) {
      if (
        error.reason === "past-date" ||
        error.reason === "daily-session-limit"
      ) {
        return result(
          "rule",
          error.reason === "past-date"
            ? "That occurrence has already passed. Choose a current or later one."
            : "A date holds at most ten sessions. The series was not changed.",
          { conflict: error.reason },
        );
      }
      return result(
        "rule",
        "That series has already started. Change it from a current occurrence instead.",
      );
    }
    if (error instanceof RollingPlanConflictError) {
      return result(
        "conflict",
        "Your plan changed somewhere else. Reload before changing the series.",
        { conflict: "stale" },
      );
    }
    if (error instanceof RollingPlanTimezoneRequiredError) {
      return result(
        "conflict",
        "Confirm your time zone before changing recurring sessions.",
        { conflict: "timezone" },
      );
    }
    if (error instanceof RollingPlanValidationError) {
      return result(
        "validation",
        "Check the recurrence, dates, and source session. Nothing was changed.",
      );
    }
    if (
      error instanceof RollingPlanAuthenticationError ||
      error instanceof SavedSessionAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended. Sign in again before changing recurring sessions.",
      );
    }
    if (error instanceof RollingPlanPersistenceError) {
      return result(
        "error",
        "The recurring-session change could not be confirmed. Reload and try again.",
      );
    }
    return result(
      "error",
      "The recurring-session change could not be completed.",
    );
  }
}

export async function materializePlanSeriesAction(
  previous: MaterializeActionState,
  formData: FormData,
): Promise<MaterializeActionState> {
  const submission = previous.submission + 1;
  const result = (
    status: MaterializeActionState["status"],
    message: string,
    extra: Partial<MaterializeActionState> = {},
  ): MaterializeActionState => ({ status, message, submission, ...extra });
  try {
    const expectedRevision = readInteger(formData.get("expectedRevision"));
    const receipt = await (
      await createRollingPlan()
    ).materializeSeries(randomUUID(), expectedRevision);
    revalidatePath("/home/plan");
    return result(
      "saved",
      receipt.createdCount === 0
        ? "Recurring sessions are current for this Plan window."
        : `Plan window extended with ${receipt.createdCount} recurring ${receipt.createdCount === 1 ? "session" : "sessions"}.`,
      { createdCount: receipt.createdCount, skipped: receipt.skipped },
    );
  } catch (error) {
    if (error instanceof RollingPlanConflictError) {
      return result(
        "conflict",
        "The Plan changed while recurring sessions were extending. Reload to continue.",
      );
    }
    if (
      error instanceof RollingPlanAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended before recurring sessions could be extended. Sign in again.",
      );
    }
    return result(
      "error",
      "Recurring sessions could not be extended. Reload the Plan to try again.",
    );
  }
}

async function buildSeriesChange(
  operation: SeriesOperation,
  formData: FormData,
  slice: RollingPlanSlice,
  series: RollingPlanSeries[],
  today: string,
  lastDate: string,
): Promise<RollingPlanChange> {
  if (operation === "add_series") {
    const rule = readRule(formData, readDate(formData.get("startDate")));
    if (rule.startDate < today || rule.startDate > lastDate) {
      throw new RollingPlanValidationError();
    }
    assertRuleHasOccurrence(rule);
    const sourceKind = formData.get("sourceKind");
    const sourceId = formData.get("sourceId");
    let input: RollingPlanSeriesInput;
    if (sourceKind === "plan") {
      const source = requireSession(slice, sourceId);
      input = plannedSessionToRollingPlanSeriesInput(source, rule);
    } else if (sourceKind === "saved") {
      const source = await (await createSavedSessionLibrary()).get(sourceId);
      if (!source) throw new RollingPlanValidationError();
      input = toRollingPlanSeriesInput(source, rule);
    } else {
      throw new RollingPlanValidationError();
    }
    return { operation, seriesId: randomUUID(), series: input };
  }

  const session = requireSession(slice, formData.get("sessionId"));
  if (session.seriesId === null || session.occurrenceDate === null) {
    throw new RollingPlanValidationError();
  }
  const segment = series.find((candidate) => candidate.id === session.seriesId);
  if (!segment) throw new RollingPlanConflictError();
  assertOccurrenceInsideSegment(session, segment, today);

  if (operation === "end_series") {
    return {
      operation,
      seriesId: segment.id,
      effectiveDate: session.occurrenceDate,
    };
  }

  const wholeSeries = canEditWholeSeries(
    segment,
    session.occurrenceDate,
    today,
  );
  const startDate = wholeSeries ? segment.startDate : session.occurrenceDate;
  const rule = readRule(formData, startDate);
  assertRuleHasOccurrence(rule);
  const input: RollingPlanSeriesInput = {
    ...rule,
    ...readContent(formData),
    activities: segment.activities.map((activity) => ({ ...activity })),
  };
  return wholeSeries
    ? { operation, seriesId: segment.id, series: input }
    : {
        operation,
        seriesId: segment.id,
        effectiveDate: session.occurrenceDate,
        successorSeriesId: randomUUID(),
        series: input,
      };
}

function assertOccurrenceInsideSegment(
  session: RollingPlanSession,
  segment: RollingPlanSeries,
  today: string,
) {
  if (
    session.occurrenceDate === null ||
    session.occurrenceDate < today ||
    session.occurrenceDate < segment.startDate ||
    (segment.endDate !== undefined && session.occurrenceDate > segment.endDate)
  ) {
    throw new RollingPlanValidationError();
  }
}

function canEditWholeSeries(
  segment: RollingPlanSeries,
  occurrenceDate: string,
  today: string,
) {
  if (segment.startDate < today) return false;
  return (
    seriesOccurrenceDates(
      segment,
      segment.startDate,
      shiftIsoDate(occurrenceDate, -1),
      1,
    ).length === 0
  );
}

function readRule(
  formData: FormData,
  startDate: string,
): RollingPlanRecurrenceRule {
  const frequency = formData.get("frequency");
  if (frequency !== "daily" && frequency !== "weekly") {
    throw new RollingPlanValidationError();
  }
  const noEnd = readBoolean(formData.get("noEnd"));
  const endValue = optionalText(formData, "endDate");
  if ((noEnd && endValue !== undefined) || (!noEnd && endValue === undefined)) {
    throw new RollingPlanValidationError();
  }
  const endDate = endValue === undefined ? undefined : readDate(endValue);
  if (endDate !== undefined && endDate < startDate) {
    throw new RollingPlanValidationError();
  }
  const intervalCount = readInteger(formData.get("intervalCount"));
  if (
    intervalCount < 1 ||
    (frequency === "daily" && intervalCount > 365) ||
    (frequency === "weekly" && intervalCount > 52)
  ) {
    throw new RollingPlanValidationError();
  }
  if (frequency === "daily") {
    return {
      frequency,
      intervalCount,
      startDate,
      ...(endDate === undefined ? {} : { endDate }),
    };
  }
  const weekdays = formData
    .getAll("weekdays")
    .map((value) => readInteger(value))
    .toSorted((left, right) => left - right);
  if (
    weekdays.length < 1 ||
    weekdays.length > 7 ||
    weekdays.some((day) => day > 6) ||
    new Set(weekdays).size !== weekdays.length
  ) {
    throw new RollingPlanValidationError();
  }
  return {
    frequency,
    intervalCount,
    weekdays: weekdays as RollingPlanRecurrenceRule["weekdays"],
    startDate,
    ...(endDate === undefined ? {} : { endDate }),
  };
}

function assertRuleHasOccurrence(rule: RollingPlanRecurrenceRule) {
  const searchEnd =
    rule.endDate === undefined
      ? shiftIsoDate(rule.startDate, 3700)
      : rule.endDate;
  const occurrences = seriesOccurrenceDates(rule, rule.startDate, searchEnd, 1);
  if (
    occurrences.length === 0 ||
    occurrences.some(
      (date) =>
        date < rule.startDate ||
        (rule.endDate !== undefined && date > rule.endDate),
    )
  ) {
    throw new RollingPlanValidationError();
  }
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
    title: requiredText(formData, "title"),
    sport: requiredText(formData, "sport"),
    ...(optionalText(formData, "intent") === undefined
      ? {}
      : { intent: requiredText(formData, "intent") }),
    ...(minutes === undefined
      ? {}
      : { expectedDurationMinutes: readInteger(minutes) }),
    ...(optionalText(formData, "note") === undefined
      ? {}
      : { note: requiredText(formData, "note") }),
  };
}

function readOperation(value: FormDataEntryValue | null) {
  return OPERATIONS.find((operation) => operation === value);
}

function readBoolean(value: FormDataEntryValue | null): boolean {
  if (value !== "true" && value !== "false") {
    throw new RollingPlanValidationError();
  }
  return value === "true";
}

function readInteger(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RollingPlanValidationError();
  }
  return parsed;
}

function readDate(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new RollingPlanValidationError();
  }
  return value;
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new RollingPlanValidationError();
  }
  return value.trim();
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
