"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  type LibraryActionState,
  type LibraryDraft,
  type LibraryOperation,
  type LibrarySaveActionState,
} from "./action-state";

import {
  nextPlanPosition,
  readPlannableDate,
  readPlanWindow,
} from "../plan-window";
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
} from "@/server/rolling-plan/rolling-plan";
import {
  SavedSessionConflictError,
  SavedSessionPersistenceError,
  SavedSessionValidationError,
} from "@/server/saved-sessions/saved-sessions";
import {
  toRollingPlanSessionInput,
  toSavedSessionDraft,
} from "@/server/saved-sessions/session-copy";

const OPERATIONS: readonly LibraryOperation[] = ["edit", "delete", "reuse"];

/**
 * Save an owned planned session into the library.
 *
 * The content is read back from the Plan on the server; the browser supplies
 * only which session and what to call it. The Plan itself is not touched: no
 * session is added, moved, locked, or cancelled by saving one.
 */
export async function saveSessionToLibraryAction(
  previous: LibrarySaveActionState,
  formData: FormData,
): Promise<LibrarySaveActionState> {
  const submission = previous.submission + 1;
  const name = stringValue(formData.get("name"));
  const failure = (
    status: LibrarySaveActionState["status"],
    message: string,
  ): LibrarySaveActionState => ({ status, message, submission, name });

  try {
    const window = await readPlanWindow();
    const slice = await (
      await createRollingPlan()
    ).getPlanSlice(window.today, window.lastDate);
    const sessionId = formData.get("sessionId");
    const session = slice.sessions.find(
      (candidate) =>
        candidate.id === sessionId && candidate.status === "active",
    );
    if (!session) throw new SavedSessionValidationError();

    await (
      await createSavedSessionLibrary()
    ).applyChange({
      operation: "create",
      session: toSavedSessionDraft(name.trim(), session),
    });
    revalidatePath("/home/plan/saved");
    return { status: "saved", message: "Saved to your library.", submission };
  } catch (error) {
    return failure(...saveFailure(error));
  }
}

/** Edit, delete, or reuse one library entry. */
export async function changeLibraryAction(
  previous: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const operation = OPERATIONS.find(
    (candidate) => candidate === formData.get("operation"),
  );
  const savedSessionId = optionalText(formData, "savedSessionId");
  const draft = operation === "edit" ? draftFrom(formData) : undefined;
  const result = (
    status: LibraryActionState["status"],
    message: string,
    conflict?: LibraryActionState["conflict"],
  ): LibraryActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation,
    savedSessionId,
    draft: status === "saved" ? undefined : draft,
    conflict,
  });

  try {
    if (!operation) throw new SavedSessionValidationError();
    const library = await createSavedSessionLibrary();

    if (operation === "reuse") {
      await reuse(library, formData);
      revalidatePath("/home/plan");
      revalidatePath("/home/plan/saved");
      return result("saved", "Added to your plan.");
    }

    await library.applyChange(
      operation === "delete"
        ? {
            operation: "delete",
            savedSessionId,
            expectedRevision: readInteger(formData.get("expectedRevision")),
          }
        : {
            operation: "edit",
            savedSessionId,
            expectedRevision: readInteger(formData.get("expectedRevision")),
            session: readContent(formData),
          },
    );
    revalidatePath("/home/plan/saved");
    return result(
      "saved",
      operation === "delete"
        ? "Saved session deleted."
        : "Saved session updated.",
    );
  } catch (error) {
    if (error instanceof RollingPlanRuleError) {
      return result(
        "rule",
        error.reason === "past-date"
          ? "That date has already passed. Pick today or a later date."
          : "A date holds at most ten sessions. Cancel or move one first.",
        error.reason,
      );
    }
    if (
      error instanceof SavedSessionConflictError ||
      error instanceof RollingPlanConflictError
    ) {
      return result(
        "conflict",
        error instanceof SavedSessionConflictError
          ? "That saved session changed somewhere else. Reload before trying this again."
          : "Your plan changed somewhere else. Reload before adding this session.",
        "stale",
      );
    }
    if (error instanceof RollingPlanTimezoneRequiredError) {
      return result(
        "conflict",
        "Confirm your time zone on the plan before adding a session.",
        "timezone",
      );
    }
    if (
      error instanceof SavedSessionValidationError ||
      error instanceof RollingPlanValidationError
    ) {
      return result(
        "validation",
        "Check the session details and the date. Nothing has been changed.",
      );
    }
    if (
      error instanceof SavedSessionAuthenticationError ||
      error instanceof RollingPlanAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended. Sign in again before changing your library.",
      );
    }
    if (
      error instanceof SavedSessionPersistenceError ||
      error instanceof RollingPlanPersistenceError
    ) {
      return result(
        "error",
        "The change could not be confirmed. Reload and try again.",
      );
    }
    return result("error", "The change could not be completed.");
  }
}

/**
 * Reuse is a copy, not a link. The library entry is read for its values and is
 * not referenced again, and the addition goes through the Plan's own change
 * set, so the past-date rule and the per-date cap apply to it unchanged.
 */
async function reuse(
  library: Awaited<ReturnType<typeof createSavedSessionLibrary>>,
  formData: FormData,
) {
  const expectedRevision = readInteger(formData.get("expectedRevision"));
  const window = await readPlanWindow();
  const localDate = readPlannableDate(formData.get("localDate"), window);
  const saved = await library.get(formData.get("savedSessionId"));
  if (!saved) throw new SavedSessionConflictError();

  const plan = await createRollingPlan();
  const slice = await plan.getPlanSlice(window.today, window.lastDate);
  if (slice.revision !== expectedRevision) throw new RollingPlanConflictError();

  await plan.applyChangeSet(
    {
      idempotencyKey: randomUUID(),
      provenance: "owner_saved_session",
      changes: [
        {
          operation: "add",
          sessionId: randomUUID(),
          session: toRollingPlanSessionInput(
            saved,
            localDate,
            nextPlanPosition(slice, localDate),
          ),
        },
      ],
    },
    expectedRevision,
  );
}

function saveFailure(
  error: unknown,
): [LibrarySaveActionState["status"], string] {
  if (error instanceof SavedSessionConflictError) {
    return [
      "conflict",
      "Your library changed somewhere else. Reload and try again.",
    ];
  }
  if (error instanceof RollingPlanConflictError) {
    return [
      "conflict",
      "Your plan changed. Reload before saving this session.",
    ];
  }
  if (error instanceof RollingPlanTimezoneRequiredError) {
    return ["conflict", "Confirm your time zone before saving a session."];
  }
  if (
    error instanceof SavedSessionValidationError ||
    error instanceof RollingPlanValidationError
  ) {
    return [
      "validation",
      "Give the saved session a name of up to 120 characters.",
    ];
  }
  if (
    error instanceof SavedSessionAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof ProfileAuthenticationError
  ) {
    return ["session", "Your session ended. Sign in again before saving."];
  }
  return ["error", "The session could not be saved. Reload and try again."];
}

function readContent(formData: FormData) {
  const minutes = optionalText(formData, "expectedDurationMinutes");
  return {
    name: text(formData, "name"),
    title: text(formData, "title"),
    sport: text(formData, "sport"),
    ...(optionalText(formData, "intent") === undefined
      ? {}
      : { intent: text(formData, "intent").trim() }),
    ...(minutes === undefined
      ? {}
      : { expectedDurationMinutes: readMinutes(minutes) }),
    ...(optionalText(formData, "note") === undefined
      ? {}
      : { note: text(formData, "note").trim() }),
  };
}

function readInteger(value: FormDataEntryValue | null): number {
  const parsed = Number(typeof value === "string" ? value : Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new SavedSessionValidationError();
  return parsed;
}

function readMinutes(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new SavedSessionValidationError();
  return parsed;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") throw new SavedSessionValidationError();
  return value;
}

function optionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function draftFrom(formData: FormData): LibraryDraft {
  return {
    name: stringValue(formData.get("name")),
    title: stringValue(formData.get("title")),
    sport: stringValue(formData.get("sport")),
    intent: stringValue(formData.get("intent")),
    expectedDurationMinutes: stringValue(
      formData.get("expectedDurationMinutes"),
    ),
    note: stringValue(formData.get("note")),
  };
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
