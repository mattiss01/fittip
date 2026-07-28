"use server";

import type { CompletionActivityInput } from "@/features/completions/completion-types";
import {
  CompletionAuthenticationError,
  CompletionConflictError,
  CompletionPersistenceError,
  createCompletionRepository,
} from "@/server/repositories/completion-repository";

export type QuickLogActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "saved";
      completionGroupId: string;
      revisionNumber: number;
    };

export async function saveQuickLog(
  _state: QuickLogActionState,
  formData: FormData,
): Promise<QuickLogActionState> {
  try {
    const repository = await createCompletionRepository();
    const completion = await repository.save({
      idempotencyKey: required(formData, "idempotencyKey"),
      completionGroupId: optional(formData, "completionGroupId"),
      expectedRevision: integer(formData, "expectedRevision", 0),
      plannedSessionId: optional(formData, "plannedSessionId"),
      actualLocalDate: required(formData, "actualLocalDate"),
      actualStartedAt: optional(formData, "actualStartedAt"),
      timezoneName: required(formData, "timezoneName"),
      durationMinutes: optionalInteger(formData, "durationMinutes"),
      status: required(formData, "outcome"),
      perceivedEffort: optionalInteger(formData, "perceivedEffort"),
      feeling: optional(formData, "feeling"),
      note: optional(formData, "note"),
      replacementDescription: optional(formData, "replacementDescription"),
      painReported: formData.get("painReported") === "on",
      illnessReported: formData.get("illnessReported") === "on",
      injuryReported: formData.get("injuryReported") === "on",
      severeFatigueReported: formData.get("severeFatigueReported") === "on",
      correctionReason: optional(formData, "correctionReason"),
      activities: readActivities(formData),
    });
    return {
      status: "saved",
      completionGroupId: completion.completionGroupId,
      revisionNumber: completion.revisionNumber,
    };
  } catch (error) {
    if (error instanceof CompletionAuthenticationError) {
      return {
        status: "error",
        message:
          "Your session expired. Sign in again before retrying; nothing was saved.",
      };
    }
    if (error instanceof CompletionConflictError) {
      return {
        status: "error",
        message:
          "This record changed before your save. Reload it before correcting again.",
      };
    }
    if (error instanceof CompletionPersistenceError) {
      return {
        status: "error",
        message:
          "We could not save this actual. Nothing was changed. Check your connection and try again.",
      };
    }
    return {
      status: "error",
      message: "Review the highlighted details and try again.",
    };
  }
}

function readActivities(formData: FormData): CompletionActivityInput[] {
  const count = integer(formData, "activityCount", 0);
  if (count < 0 || count > 50) throw new Error("Invalid activity count");
  const activities: CompletionActivityInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = optional(formData, `activity-${index}-name`);
    const measurement = optional(formData, `activity-${index}-measurement`);
    const plannedActivityId = optional(
      formData,
      `activity-${index}-planned-id`,
    );
    if ((plannedActivityId && !measurement) || (!name && !measurement)) {
      continue;
    }
    if (!name) throw new Error("Activity name required");

    activities.push({
      plannedActivityId,
      personalActivityId: optional(formData, `activity-${index}-personal-id`),
      position: activities.length,
      name,
      sport: required(formData, `activity-${index}-sport`),
      instructions: optional(formData, `activity-${index}-instructions`),
      measurementMode: required(
        formData,
        `activity-${index}-mode`,
      ) as CompletionActivityInput["measurementMode"],
      actualMeasurement: measurement
        ? (JSON.parse(
            measurement,
          ) as CompletionActivityInput["actualMeasurement"])
        : undefined,
    });
  }
  return activities;
}

function required(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function optional(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function integer(formData: FormData, name: string, fallback: number): number {
  const value = optional(formData, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${name}`);
  return parsed;
}

function optionalInteger(formData: FormData, name: string): number | undefined {
  const value = optional(formData, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${name}`);
  return parsed;
}
