"use server";

import { revalidatePath } from "next/cache";

import type { OnboardingActionState } from "./action-state";

import {
  OnboardingValidationError,
  parseConstraintsPayload,
  parseContextPayload,
  parseExpectedRevision,
  parseGoalsPayload,
  parseIdempotencyKey,
  parseOnboardingStep,
  parsePreferencesPayload,
  parseReviewPayload,
  parseTrainingPayload,
  type OnboardingStep,
} from "@/server/onboarding/onboarding-records";
import {
  createOnboardingRepository,
  OnboardingAuthenticationError,
  OnboardingConflictError,
  OnboardingDatabaseValidationError,
  OnboardingPersistenceError,
  type OnboardingOperation,
} from "@/server/repositories/onboarding-repository";

export async function changeOnboardingAction(
  previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const operation = stringValue(formData.get("operation"));
  const result = (
    status: OnboardingActionState["status"],
    message: string,
    options: Pick<OnboardingActionState, "nextStep" | "redirectTo"> = {},
  ): OnboardingActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    ...options,
  });

  try {
    const expectedDraftRevision = parseLooseRevision(
      formData.get("expectedDraftRevision"),
    );
    const repository = await createOnboardingRepository();
    if (operation === "start" || operation === "dismiss_prompt") {
      await repository.apply({
        operation,
        expectedDraftRevision,
      });
      revalidate();
      return result(
        "saved",
        operation === "start"
          ? "Guided setup started."
          : "The Home invitation has been removed.",
        operation === "start" ? { nextStep: 1 } : {},
      );
    }

    if (operation === "cancel") {
      await repository.apply({
        operation,
        expectedDraftRevision,
      });
      revalidate();
      return result("saved", "The setup draft was permanently deleted.", {
        redirectTo: "/home/you",
      });
    }

    if (operation === "publish") {
      const reviewReceipt = await repository.apply({
        operation: "save_review",
        expectedDraftRevision,
        payload: parseReviewPayload(formData),
      });
      if (
        reviewReceipt.draft_revision === null ||
        reviewReceipt.idempotency_key === null
      ) {
        throw new OnboardingPersistenceError();
      }
      await repository.apply({
        operation: "publish",
        expectedDraftRevision: reviewReceipt.draft_revision,
        expectedGoalRevision: parseExpectedRevision(
          formData.get("expectedGoalRevision"),
        ),
        expectedMemoryRevision: parseExpectedRevision(
          formData.get("expectedMemoryRevision"),
        ),
        idempotencyKey: parseIdempotencyKey(formData.get("idempotencyKey")),
      });
      revalidate();
      return result(
        "published",
        "Accepted items were saved to Goals and Memory.",
      );
    }

    const step = parseOnboardingStep(formData.get("step"));
    const advance = stringValue(formData.get("intent")) !== "finish";
    const payload = payloadFor(operation, step, formData, advance);
    await repository.apply({
      operation: operation as OnboardingOperation,
      expectedDraftRevision: parseExpectedRevision(
        formData.get("expectedDraftRevision"),
      ),
      payload,
    });
    revalidate();
    return result("saved", "This step was saved.", {
      nextStep: advance ? nextStep(step) : step,
      ...(advance ? {} : { redirectTo: "/home/you" }),
    });
  } catch (error) {
    if (
      error instanceof OnboardingValidationError ||
      error instanceof OnboardingDatabaseValidationError
    ) {
      return result(
        "validation",
        "Check the highlighted step. Nothing from this attempt was saved.",
      );
    }
    if (error instanceof OnboardingConflictError) {
      return result(
        "conflict",
        "Goals, Memory, or this setup changed in another tab. Your saved decisions remain in the draft; reload to compare again.",
      );
    }
    if (error instanceof OnboardingAuthenticationError) {
      return result(
        "session",
        "Your session ended. Sign in again before continuing setup.",
      );
    }
    if (error instanceof OnboardingPersistenceError) {
      return result(
        "error",
        "The setup change could not be confirmed. Reload and try again.",
      );
    }
    return result(
      "error",
      "The setup change could not be completed. Nothing from this attempt was saved.",
    );
  }
}

function payloadFor(
  operation: string,
  step: OnboardingStep,
  formData: FormData,
  advance: boolean,
) {
  const expectedOperation: Record<OnboardingStep, OnboardingOperation> = {
    1: "save_goals",
    2: "save_training",
    3: "save_context",
    4: "save_preferences",
    5: "save_constraints",
    6: "save_review",
  };
  if (operation !== expectedOperation[step] || step === 6) {
    throw new OnboardingValidationError();
  }
  if (step === 1) return parseGoalsPayload(formData, advance);
  if (step === 2) return parseTrainingPayload(formData, advance);
  if (step === 3) return parseContextPayload(formData, advance);
  if (step === 4) return parsePreferencesPayload(formData, advance);
  return parseConstraintsPayload(formData, advance);
}

function nextStep(step: OnboardingStep): OnboardingStep {
  return Math.min(6, step + 1) as OnboardingStep;
}

function parseLooseRevision(value: FormDataEntryValue | null): number {
  if (value === null || value === "") return 0;
  return parseExpectedRevision(value);
}

function revalidate() {
  revalidatePath("/home/today");
  revalidatePath("/home/you");
  revalidatePath("/home/you/onboarding");
  revalidatePath("/home/you/goals");
  revalidatePath("/home/you/memory");
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
