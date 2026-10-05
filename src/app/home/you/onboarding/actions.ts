"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { OnboardingActionState } from "./action-state";

import { GoalValidationError } from "@/server/goals/goal-records";
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
import { createProfileRepository } from "@/server/repositories/profile-repository";
import {
  createOnboardingRepository,
  OnboardingAuthenticationError,
  OnboardingConflictError,
  OnboardingDatabaseValidationError,
  OnboardingPersistenceError,
  type OnboardingOperation,
} from "@/server/repositories/onboarding-repository";

/**
 * "Continue later" from a step the profile saves ("About you", "Your
 * sports"): records that the owner chose to leave, so the next sign-in asks
 * about setup instead of opening it, and goes to the app.
 */
export async function leaveSetupAction(): Promise<void> {
  await recordSkip();
  redirect("/home/today");
}

/**
 * A sport a goal names that is not among the owner's sports was made up on
 * the goal step, and joins them (owner, 5 Oct 2026), so it is there to pick
 * the next time. The goals are already saved by now; if this cannot be done
 * the goal keeps its sport and the owner's list is simply not longer.
 */
async function keepGoalSports(
  goals: readonly { activityAreas: readonly string[] }[],
): Promise<void> {
  try {
    const profiles = await createProfileRepository();
    const owned = (await profiles.getDetails())?.sports ?? [];
    const known = new Set(owned.map((sport) => sport.toLocaleLowerCase()));
    const added: string[] = [];
    for (const sport of goals.flatMap((goal) => goal.activityAreas)) {
      const key = sport.toLocaleLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      added.push(sport);
    }
    if (added.length > 0) await profiles.saveSports([...owned, ...added]);
  } catch {
    // See above: the goal step's own save has gone through.
  }
}

/** Never in the way of leaving: a skip that cannot be recorded is not one. */
async function recordSkip(): Promise<void> {
  try {
    const repository = await createOnboardingRepository();
    await repository.apply({
      operation: "dismiss_prompt",
      expectedDraftRevision: 0,
    });
  } catch {
    // The next sign-in opens setup rather than asking; nothing is lost.
  }
}

export async function changeOnboardingAction(
  previous: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const state = await resolveOnboardingAction(previous, formData);
  if (state.redirectTo) redirect(state.redirectTo);
  return state;
}

async function resolveOnboardingAction(
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
    // Done once, setup is not started again (owner, 2 Oct 2026). The page
    // no longer offers it; this is the same rule for a request made by hand.
    if (
      operation === "start" &&
      (await repository.getEntryState()).hasPublished
    ) {
      return result(
        "validation",
        "Setup is finished. Change anything in Goals and Memory.",
      );
    }
    if (operation === "start" || operation === "dismiss_prompt") {
      await repository.apply({
        operation,
        expectedDraftRevision,
      });
      revalidate();
      return result(
        "saved",
        operation === "start" ? "" : "The Home invitation has been removed.",
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
      // Straight back to You, which says it is saved (owner, 2 Oct 2026).
      // There was a "Setup saved" page here that offered to run it again.
      return result(
        "published",
        "Accepted items were saved to Goals and Memory.",
        { redirectTo: "/home/you?setup=done" },
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
    if (step === 1) {
      await keepGoalSports(parseGoalsPayload(formData, advance).goals);
    }
    revalidate();
    if (!advance) await recordSkip();
    return result("saved", "This step was saved.", {
      nextStep: advance ? nextStep(step) : step,
      // "Continue later" goes to the app (owner, 5 Oct 2026).
      ...(advance ? {} : { redirectTo: "/home/today" }),
    });
  } catch (error) {
    if (
      error instanceof OnboardingValidationError ||
      error instanceof OnboardingDatabaseValidationError ||
      // The goals step is parsed by the goal rules, which have their own.
      error instanceof GoalValidationError
    ) {
      // "Continue later" leaves whatever the step holds (owner, 2 Oct
      // 2026). A step the draft cannot store as it stands is not saved; the
      // steps before it are already in the draft.
      if (stringValue(formData.get("intent")) === "finish") {
        await recordSkip();
        return result("saved", "", { redirectTo: "/home/today" });
      }
      return result(
        "validation",
        "Review this step and correct the details. Nothing from this attempt was saved.",
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
