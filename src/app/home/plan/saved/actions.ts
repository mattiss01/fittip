"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  type LibraryActionState,
  type LibraryDraft,
  type LibraryOperation,
  type LibrarySaveActionState,
} from "./action-state";

import { readSubmittedTemplateActivities } from "../activity-form";
import { recordsTraining } from "../../log/log-action-state";
import {
  nextPlanPosition,
  readPlannableDate,
  readPlanWindow,
} from "../plan-window";
import {
  planChangeCopy,
  topUpAfterPlanChange,
} from "../series-materialization";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  nextFreeTitle,
  savedSessionTitleKey,
} from "@/lib/training/activity-name";
import { keepSports, submittedSports } from "@/server/profile/keep-sports";
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
  SavedSessionTitleTakenError,
  SavedSessionValidationError,
  type SavedSessionDraft,
} from "@/server/saved-sessions/saved-sessions";
import {
  completionToSavedSessionDraft,
  toRollingPlanSessionInput,
  toSavedSessionDraft,
} from "@/server/saved-sessions/session-copy";

const OPERATIONS: readonly LibraryOperation[] = [
  "create",
  "edit",
  "delete",
  "reuse",
];

/**
 * Save an owned planned session into the library.
 *
 * The content is read back from the Plan on the server; the browser supplies
 * only which session. The Plan itself is not touched: no session is added,
 * moved, or cancelled by saving one.
 */
export async function saveSessionToLibraryAction(
  previous: LibrarySaveActionState,
  formData: FormData,
): Promise<LibrarySaveActionState> {
  const submission = previous.submission + 1;
  const failure = (
    status: LibrarySaveActionState["status"],
    message: string,
  ): LibrarySaveActionState => ({ status, message, submission });

  try {
    const window = await readPlanWindow();
    const slice = await (
      await createRollingPlan()
    ).getPlanSlice(window.today, window.lastPlaceableDate);
    const sessionId = formData.get("sessionId");
    const session = slice.sessions.find(
      (candidate) =>
        candidate.id === sessionId && candidate.status === "active",
    );
    if (!session) throw new SavedSessionValidationError();

    return await saveDraft(toSavedSessionDraft(session), formData, submission);
  } catch (error) {
    return failure(...saveFailure(error));
  }
}

/**
 * Save a written log into the library, from its receipt or its Progress
 * record. As with the Plan's save, the content is read back on the server and
 * the browser supplies only which log. The log itself is not touched.
 */
export async function saveLogToLibraryAction(
  previous: LibrarySaveActionState,
  formData: FormData,
): Promise<LibrarySaveActionState> {
  const submission = previous.submission + 1;
  try {
    const completion = await (
      await createCompletionLog()
    ).get(formData.get("completionId"));
    if (completion === null || !recordsTraining(completion.status)) {
      throw new SavedSessionValidationError();
    }
    return await saveDraft(
      completionToSavedSessionDraft(completion),
      formData,
      submission,
    );
  } catch (error) {
    const [status, message] = saveFailure(error);
    return { status, message, submission };
  }
}

/**
 * One entry per title (owner, 15 Oct 2026). A save whose title is taken asks
 * first: the form comes back `exists`, with the next free title, and is sent
 * again with `onExisting` set. "update" replaces the entry with that title by
 * this copy; "new" saves it under the title the owner gave.
 */
async function saveDraft(
  draft: SavedSessionDraft,
  formData: FormData,
  submission: number,
): Promise<LibrarySaveActionState> {
  const library = await createSavedSessionLibrary();
  const onExisting = formData.get("onExisting");

  if (onExisting === "update") {
    const key = savedSessionTitleKey(draft.title);
    const existing = (await library.list()).find(
      (entry) => savedSessionTitleKey(entry.title) === key,
    );
    // Renamed or deleted since the question was asked: then there is nothing
    // to update, and it is saved as asked the first time.
    if (existing) {
      await library.applyChange({
        operation: "edit",
        savedSessionId: existing.id,
        expectedRevision: existing.revision,
        session: draft,
      });
      revalidatePath("/home/plan/saved");
      return {
        status: "saved",
        message: "Updated in your library.",
        submission,
      };
    }
  }

  const title =
    onExisting === "new"
      ? String(formData.get("title") ?? "").trim()
      : draft.title;
  // "Keep both" stays open on its own question rather than starting over.
  const askAgain = async (message: string): Promise<LibrarySaveActionState> => {
    const taken = new Set(
      (await library.list()).map((entry) => savedSessionTitleKey(entry.title)),
    );
    return {
      status: "exists",
      message,
      submission,
      suggestedTitle: nextFreeTitle(title || draft.title, taken),
    };
  };
  if (title === "") return await askAgain("Give the new entry a title.");
  try {
    await library.applyChange({
      operation: "create",
      session: { ...draft, name: title, title },
    });
  } catch (error) {
    if (!(error instanceof SavedSessionTitleTakenError)) throw error;
    return await askAgain(
      onExisting === "new"
        ? "That title is in your library too. Choose another."
        : "Already in your library.",
    );
  }
  revalidatePath("/home/plan/saved");
  return { status: "saved", message: "Saved to your library.", submission };
}

/** Create a library entry, or edit, delete, or reuse one. */
export async function changeLibraryAction(
  previous: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const operation = OPERATIONS.find(
    (candidate) => candidate === formData.get("operation"),
  );
  const savedSessionId = optionalText(formData, "savedSessionId");
  const draft =
    operation === "edit" || operation === "create"
      ? draftFrom(formData)
      : undefined;
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
      const topUp = await reuse(library, formData);
      revalidatePath("/home/plan");
      revalidatePath("/home/plan/saved");
      return result("saved", planChangeCopy("Added to your plan.", topUp));
    }

    // The editor submits the whole list, so an edit replaces it.
    const session = () => ({
      ...readContent(formData),
      activities: readSubmittedTemplateActivities(formData),
    });
    await library.applyChange(
      operation === "delete"
        ? {
            operation: "delete",
            savedSessionId,
            expectedRevision: readInteger(formData.get("expectedRevision")),
          }
        : operation === "create"
          ? // Written in the library itself (owner, 2 Oct 2026). It makes an
            // entry and nothing else: the Plan is not read or touched.
            { operation: "create", session: session() }
          : {
              operation: "edit",
              savedSessionId,
              expectedRevision: readInteger(formData.get("expectedRevision")),
              session: session(),
            },
    );
    await keepSports(submittedSports(formData));
    revalidatePath("/home/plan/saved");
    return result(
      "saved",
      operation === "delete"
        ? "Saved session deleted."
        : operation === "create"
          ? "Added to your library."
          : "Saved session updated.",
    );
  } catch (error) {
    if (error instanceof RollingPlanRuleError) {
      // As in the plan action: this one composes no series change, so a series
      // rule cannot reach here and is not given this action's wording.
      if (
        error.reason === "past-date" ||
        error.reason === "daily-session-limit"
      ) {
        return result(
          "rule",
          error.reason === "past-date"
            ? "That date has already passed. Pick today or a later date."
            : "A date holds at most ten sessions. Cancel or move one first.",
          error.reason,
        );
      }
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
    // One entry per title (owner, 15 Oct 2026). Here the owner is typing the
    // title, so it is theirs to change; the form keeps what they wrote.
    if (error instanceof SavedSessionTitleTakenError) {
      return result(
        "validation",
        "An entry with this title is already in your library. Choose another title.",
      );
    }
    if (
      error instanceof SavedSessionValidationError ||
      error instanceof RollingPlanValidationError
    ) {
      return result(
        "validation",
        // Only "Use in plan" has a date to get wrong.
        operation === "reuse"
          ? "Check the session details and the date. Nothing has been changed."
          : "Check the session details. Nothing has been changed.",
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
  const slice = await plan.getPlanSlice(window.today, window.lastPlaceableDate);
  if (slice.revision !== expectedRevision) throw new RollingPlanConflictError();

  const receipt = await plan.applyChangeSet(
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
  return await topUpAfterPlanChange(plan, receipt.planRevision);
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
      "This could not be saved to your library. A saved session needs a title and a sport.",
    ];
  }
  if (
    error instanceof SavedSessionAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof ProfileAuthenticationError ||
    error instanceof CompletionAuthenticationError
  ) {
    return ["session", "Your session ended. Sign in again before saving."];
  }
  return ["error", "The session could not be saved. Reload and try again."];
}

function readContent(formData: FormData) {
  const minutes = optionalText(formData, "expectedDurationMinutes");
  return {
    // One field since 2 Oct 2026: an entry is named by its title.
    name: text(formData, "title"),
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
