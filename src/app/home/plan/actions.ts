"use server";

import { revalidatePath } from "next/cache";

import type {
  ArchiveActivityActionResult,
  PersonalActivityActionResult,
  PlanningActionResult,
} from "@/features/planning/planning-types";
import {
  createTrainingRecordRepository,
  TrainingPlanConflictError,
  TrainingRecordAuthenticationError,
  TrainingRecordPersistenceError,
} from "@/server/repositories/training-record-repository";
import { TrainingRecordValidationError } from "@/server/training/training-records";
import { PastPlanContentMutationError } from "@/server/training/past-plan-protection";

export async function savePlanAction(
  plan: unknown,
  expectedRevision: number,
): Promise<PlanningActionResult> {
  try {
    const repository = await createTrainingRecordRepository();
    const version = await repository.saveManualPlan(plan, expectedRevision);
    revalidatePath("/home/plan");
    return {
      status: "saved",
      revision: version.versionNumber,
      versionNumber: version.versionNumber,
      acceptedAt: version.acceptedAt,
    };
  } catch (error) {
    if (error instanceof PastPlanContentMutationError) {
      return {
        status: "validation-error",
        message:
          "Past accepted sessions are read-only. Reload the current plan before saving.",
      };
    }
    if (error instanceof TrainingRecordValidationError) {
      return {
        status: "validation-error",
        message:
          "Check the highlighted plan details. Nothing has been saved yet.",
      };
    }
    if (error instanceof TrainingPlanConflictError) {
      return {
        status: "conflict",
        message:
          "This plan changed in another tab. Reload the current plan before saving again.",
      };
    }
    if (error instanceof TrainingRecordAuthenticationError) {
      return {
        status: "session-expired",
        message: "Your session ended. Sign in again before saving.",
      };
    }
    if (error instanceof TrainingRecordPersistenceError) {
      return {
        status: "save-error",
        message:
          "The plan could not be saved. Your draft is still here; try again.",
      };
    }
    return {
      status: "save-error",
      message: "The plan could not be saved. Your draft is still here.",
    };
  }
}

export async function createPersonalActivityAction(
  input: unknown,
): Promise<PersonalActivityActionResult> {
  try {
    const repository = await createTrainingRecordRepository();
    const activity = await repository.createPersonalActivity(input);
    revalidatePath("/home/plan");
    return { status: "saved", activity: toPersonalActivityOption(activity) };
  } catch (error) {
    return mapPersonalActivityError(error);
  }
}

export async function updatePersonalActivityAction(
  id: string,
  input: unknown,
): Promise<PersonalActivityActionResult> {
  try {
    const repository = await createTrainingRecordRepository();
    const activity = await repository.updatePersonalActivity(id, input);
    revalidatePath("/home/plan");
    return { status: "saved", activity: toPersonalActivityOption(activity) };
  } catch (error) {
    return mapPersonalActivityError(error);
  }
}

export async function archivePersonalActivityAction(
  id: string,
): Promise<ArchiveActivityActionResult> {
  try {
    const repository = await createTrainingRecordRepository();
    await repository.archivePersonalActivity(id);
    revalidatePath("/home/plan");
    return { status: "archived", id };
  } catch (error) {
    if (error instanceof TrainingRecordValidationError) {
      return {
        status: "validation-error",
        message: "That activity could not be identified.",
      };
    }
    if (error instanceof TrainingRecordAuthenticationError) {
      return {
        status: "session-expired",
        message: "Your session ended. Sign in again before making changes.",
      };
    }
    return {
      status: "save-error",
      message: "The activity could not be archived. Try again.",
    };
  }
}

function mapPersonalActivityError(
  error: unknown,
): PersonalActivityActionResult {
  if (error instanceof TrainingRecordValidationError) {
    return {
      status: "validation-error",
      message: "Check the activity name, sport, and measurement mode.",
    };
  }
  if (error instanceof TrainingRecordAuthenticationError) {
    return {
      status: "session-expired",
      message: "Your session ended. Sign in again before making changes.",
    };
  }
  return {
    status: "save-error",
    message: "The activity could not be saved. Try again.",
  };
}

function toPersonalActivityOption(activity: {
  id: string;
  name: string;
  sport: string;
  description: string | null;
  measurementMode: string;
  defaultMeasurement: unknown;
}) {
  return {
    id: activity.id,
    name: activity.name,
    sport: activity.sport,
    description: activity.description,
    measurementMode: activity.measurementMode as
      | "duration_intensity"
      | "time_distance_pace"
      | "skill_repetitions"
      | "sets_reps_load"
      | "custom",
    ...(activity.defaultMeasurement === null
      ? {}
      : {
          defaultMeasurement: activity.defaultMeasurement as Record<
            string,
            string | number | boolean | undefined
          >,
        }),
  };
}
