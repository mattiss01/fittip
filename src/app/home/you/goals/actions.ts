"use server";

import { revalidatePath } from "next/cache";

import type { GoalActionDraft, GoalActionState } from "./action-state";

import {
  GoalValidationError,
  parseExpectedRevision,
  parseGoalId,
} from "@/server/goals/goal-records";
import {
  createGoalRepository,
  GoalAuthenticationError,
  GoalConflictError,
  GoalPersistenceError,
} from "@/server/repositories/goal-repository";

export async function changeGoalAction(
  previous: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const submittedOperation = stringValue(formData.get("operation"));
  const submittedGoalId = stringValue(formData.get("goalId")) || undefined;
  const submittedDraft =
    submittedOperation === "create" || submittedOperation === "edit"
      ? draftFrom(formData)
      : undefined;
  const resultState = (
    status: GoalActionState["status"],
    message: string,
    preserveDraft: boolean,
    conflict?: GoalActionState["conflict"],
  ): GoalActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation: submittedOperation,
    goalId: submittedGoalId,
    draft: preserveDraft ? submittedDraft : undefined,
    conflict,
  });

  try {
    const repository = await createGoalRepository();
    const operation = submittedOperation;
    const expectedRevision = parseExpectedRevision(
      formData.get("expectedRevision"),
    );

    if (operation === "create" || operation === "edit") {
      const priorityTier = text(formData, "priorityTier");
      const originalPriorityTier =
        operation === "edit"
          ? optionalText(formData, "originalPriorityTier")
          : undefined;
      const input = {
        title: text(formData, "title"),
        desiredOutcome: text(formData, "desiredOutcome"),
        category: text(formData, "category"),
        activityAreas: text(formData, "activityAreas")
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean),
        startDate: text(formData, "startDate"),
        targetDate: optionalText(formData, "targetDate"),
        targetDetail: optionalText(formData, "targetDetail"),
        targetMetricLabel: optionalText(formData, "targetMetricLabel"),
        targetMetricValue: optionalText(formData, "targetMetricValue"),
        targetMetricUnit: optionalText(formData, "targetMetricUnit"),
        priorityTier,
        targetRank:
          operation === "edit" &&
          originalPriorityTier !== undefined &&
          originalPriorityTier !== priorityTier
            ? undefined
            : optionalNumber(formData, "targetRank"),
        rationale: optionalText(formData, "rationale"),
        constraints: optionalText(formData, "constraints"),
      };
      if (operation === "create") {
        await repository.create(input, expectedRevision);
      } else {
        await repository.edit(
          parseGoalId(formData.get("goalId")),
          input,
          expectedRevision,
        );
      }
    } else if (operation === "reorder") {
      await repository.reorder(
        formData.get("priorityTier"),
        text(formData, "orderedGoalIds").split(",").filter(Boolean),
        expectedRevision,
      );
    } else if (
      [
        "pause",
        "resume",
        "achieve",
        "abandon",
        "reopen",
        "archive",
        "delete",
      ].includes(operation)
    ) {
      await repository.transition(
        operation as
          | "pause"
          | "resume"
          | "achieve"
          | "abandon"
          | "reopen"
          | "archive"
          | "delete",
        formData.get("goalId"),
        expectedRevision,
        operation === "resume" || operation === "reopen"
          ? {
              tier: formData.get("priorityTier"),
              rank: optionalNumber(formData, "targetRank"),
            }
          : undefined,
      );
    } else {
      throw new GoalValidationError();
    }

    revalidatePath("/home/you");
    revalidatePath("/home/you/goals");
    return resultState("saved", resultCopy(operation), false);
  } catch (error) {
    if (error instanceof GoalValidationError) {
      return resultState(
        "validation",
        "Check the goal details and dates. Your change has not been saved.",
        true,
      );
    }
    if (error instanceof GoalConflictError) {
      if (error.reason === "core-limit") {
        return resultState(
          "conflict",
          "Three core goals are already active. Make this supporting or pause another core goal.",
          true,
          "core-limit",
        );
      }
      if (error.reason === "archive-required") {
        return resultState(
          "conflict",
          "This goal has retained history. Archive it instead of deleting it.",
          true,
          "archive-required",
        );
      }
      return resultState(
        "conflict",
        "Goals changed in another tab. Reload before trying this change again.",
        true,
        "stale",
      );
    }
    if (error instanceof GoalAuthenticationError) {
      return resultState(
        "session",
        "Your session ended. Sign in again before changing goals.",
        true,
      );
    }
    if (error instanceof GoalPersistenceError) {
      return resultState(
        "error",
        "The goal change could not be confirmed. Reload and try again.",
        true,
      );
    }
    return resultState(
      "error",
      "The goal change could not be completed.",
      true,
    );
  }
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new GoalValidationError();
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = text(formData, key).trim();
  return value === "" ? undefined : value;
}

function optionalNumber(formData: FormData, key: string): number | undefined {
  const value = optionalText(formData, key);
  return value === undefined ? undefined : Number(value);
}

function draftFrom(formData: FormData): GoalActionDraft {
  return {
    title: stringValue(formData.get("title")),
    desiredOutcome: stringValue(formData.get("desiredOutcome")),
    category: stringValue(formData.get("category")),
    activityAreas: stringValue(formData.get("activityAreas")),
    startDate: stringValue(formData.get("startDate")),
    targetDate: stringValue(formData.get("targetDate")),
    targetDetail: stringValue(formData.get("targetDetail")),
    targetMetricLabel: stringValue(formData.get("targetMetricLabel")),
    targetMetricValue: stringValue(formData.get("targetMetricValue")),
    targetMetricUnit: stringValue(formData.get("targetMetricUnit")),
    priorityTier: stringValue(formData.get("priorityTier")),
    rationale: stringValue(formData.get("rationale")),
    constraints: stringValue(formData.get("constraints")),
  };
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function resultCopy(operation: string): string {
  const copy: Record<string, string> = {
    create: "Goal created.",
    edit: "Goal updated.",
    reorder: "Goal order saved.",
    pause: "Goal paused.",
    resume: "Goal resumed.",
    achieve: "Goal marked achieved.",
    abandon: "Goal marked abandoned.",
    reopen: "Goal reopened.",
    archive: "Goal archived.",
    delete: "Goal permanently deleted.",
  };
  return copy[operation] ?? "Goal change saved.";
}
