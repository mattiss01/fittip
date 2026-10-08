"use server";

import { revalidatePath } from "next/cache";

import {
  type ActivityLibraryActionState,
  type ActivityLibraryOperation,
} from "./action-state";

import type { SaveToLibraryResult } from "@/components/training/activity-editor";
import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";
import {
  PersonalActivityConflictError,
  PersonalActivityNameTakenError,
  PersonalActivityPersistenceError,
  PersonalActivityValidationError,
} from "@/server/personal-activities/personal-activities";
import {
  keepSports,
  sportOf,
  submittedSports,
} from "@/server/profile/keep-sports";
import {
  createPersonalActivityLibrary,
  PersonalActivityAuthenticationError,
} from "@/server/repositories/personal-activity-repository";

const OPERATIONS: readonly ActivityLibraryOperation[] = [
  "create",
  "edit",
  "archive",
];

/**
 * Create, edit, or archive one personal activity (A5).
 *
 * Only the definition is written. A session, series, saved entry or log that
 * copied it keeps its own values, so none of them is read or revalidated here.
 */
export async function changeActivityLibraryAction(
  previous: ActivityLibraryActionState,
  formData: FormData,
): Promise<ActivityLibraryActionState> {
  const operation = OPERATIONS.find(
    (candidate) => candidate === formData.get("operation"),
  );
  const personalActivityId = optionalString(formData, "personalActivityId");
  const result = (
    status: ActivityLibraryActionState["status"],
    message: string,
  ): ActivityLibraryActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation,
    personalActivityId,
  });

  try {
    if (!operation) throw new PersonalActivityValidationError();
    const library = await createPersonalActivityLibrary();
    const expectedUpdatedAt = formData.get("expectedUpdatedAt");

    const saved = await library.applyChange(
      operation === "create"
        ? { operation, activity: readActivity(formData) }
        : operation === "edit"
          ? {
              operation,
              personalActivityId,
              expectedUpdatedAt,
              activity: readActivity(formData),
            }
          : { operation, personalActivityId, expectedUpdatedAt },
    );
    await keepSports(submittedSports(formData));
    revalidatePath("/home/plan/activities");
    return {
      ...result(
        "saved",
        operation === "create"
          ? `${saved.name} added to your activities.`
          : operation === "edit"
            ? `${saved.name} updated.`
            : `${saved.name} removed from your library.`,
      ),
      personalActivityId: saved.id,
    };
  } catch (error) {
    if (error instanceof PersonalActivityNameTakenError) {
      return result("validation", nameTakenMessage(submittedName(formData)));
    }
    if (error instanceof PersonalActivityConflictError) {
      return result(
        "conflict",
        "That activity changed somewhere else. Reload before trying this again.",
      );
    }
    if (error instanceof PersonalActivityValidationError) {
      return result(
        "validation",
        "Check the activity's name, sport and target. Nothing has been changed.",
      );
    }
    if (error instanceof PersonalActivityAuthenticationError) {
      return result(
        "session",
        "Your session ended. Sign in again before changing your activities.",
      );
    }
    if (error instanceof PersonalActivityPersistenceError) {
      return result(
        "error",
        "The change could not be confirmed. Reload and try again.",
      );
    }
    return result("error", "The change could not be completed.");
  }
}

/**
 * Save one activity from a session editor as a new library definition.
 *
 * Called directly rather than through a form, because the row lives inside the
 * session's own form and forms do not nest. It always creates: an activity
 * removed from the library is had again as a new definition (owner, 27 Sep
 * 2026), and nothing about the session itself is written.
 */
export async function saveActivityToLibraryAction(
  activity: unknown,
): Promise<SaveToLibraryResult> {
  try {
    const saved = await (
      await createPersonalActivityLibrary()
    ).applyChange({ operation: "create", activity });
    await keepSports([sportOf(activity)]);
    revalidatePath("/home/plan/activities");
    return {
      status: "saved",
      message: `Saved to your library as ${saved.name}.`,
      personalActivityId: saved.id,
      updatedAt: saved.updatedAt,
    };
  } catch (error) {
    if (error instanceof PersonalActivityNameTakenError) {
      // The row's own wording, so the owner reads the same sentence whether
      // the editor caught the clash first or the database did.
      const name = submittedNameOf(activity);
      return {
        status: "refused",
        message:
          name === undefined
            ? nameTakenMessage(undefined)
            : ACTIVITY_COPY.nameTaken(name),
      };
    }
    if (error instanceof PersonalActivityValidationError) {
      return {
        status: "refused",
        message: "Give it a name and a sport before saving it.",
      };
    }
    if (error instanceof PersonalActivityAuthenticationError) {
      return {
        status: "refused",
        message: "Your session ended. Sign in again before saving.",
      };
    }
    return {
      status: "refused",
      message: "It could not be saved. Try again.",
    };
  }
}

/**
 * Update a library definition from a session editor's row that came from it
 * (owner, 27 Sep 2026): "picked Latzug, changed it" can now change Latzug
 * itself, where before it could only become a new definition. Only the
 * definition is written. Sessions, saved entries and logs that copied it keep
 * their own values, as they do after an edit on the Activities page.
 */
export async function updateActivityInLibraryAction(
  personalActivityId: unknown,
  expectedUpdatedAt: unknown,
  activity: unknown,
): Promise<SaveToLibraryResult> {
  try {
    const saved = await (
      await createPersonalActivityLibrary()
    ).applyChange({
      operation: "edit",
      personalActivityId,
      expectedUpdatedAt,
      activity,
    });
    await keepSports([sportOf(activity)]);
    revalidatePath("/home/plan/activities");
    return {
      status: "saved",
      message: `${saved.name} updated in your library.`,
      personalActivityId: saved.id,
      updatedAt: saved.updatedAt,
    };
  } catch (error) {
    if (error instanceof PersonalActivityNameTakenError) {
      const name = submittedNameOf(activity);
      return {
        status: "refused",
        message:
          name === undefined
            ? nameTakenMessage(undefined)
            : ACTIVITY_COPY.nameTaken(name),
      };
    }
    if (error instanceof PersonalActivityConflictError) {
      return {
        status: "refused",
        message:
          "That library activity changed somewhere else, or was removed. Reload before updating it.",
      };
    }
    if (error instanceof PersonalActivityValidationError) {
      return {
        status: "refused",
        message: "Give it a name and a sport before saving it.",
      };
    }
    if (error instanceof PersonalActivityAuthenticationError) {
      return {
        status: "refused",
        message: "Your session ended. Sign in again before saving.",
      };
    }
    return {
      status: "refused",
      message: "It could not be updated. Try again.",
    };
  }
}

function nameTakenMessage(name: string | undefined): string {
  return `${
    name === undefined
      ? "An activity with that name"
      : `An activity called ${name}`
  } is already in your library. Give this one another name, or change the existing one under Activities.`;
}

/** The name as the owner typed it, for the refusal only; never parsed on. */
function submittedName(formData: FormData): string | undefined {
  try {
    return submittedNameOf(readActivity(formData));
  } catch {
    return undefined;
  }
}

function submittedNameOf(activity: unknown): string | undefined {
  if (typeof activity !== "object" || activity === null) return undefined;
  const name = (activity as { name?: unknown }).name;
  return typeof name === "string" && name.trim() !== ""
    ? name.trim().slice(0, 120)
    : undefined;
}

/** One JSON field, as `ActivityDefinitionEditor` writes it. */
function readActivity(formData: FormData): unknown {
  const raw = formData.get("activity");
  if (typeof raw !== "string") throw new PersonalActivityValidationError();
  try {
    return JSON.parse(raw);
  } catch {
    throw new PersonalActivityValidationError();
  }
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}
