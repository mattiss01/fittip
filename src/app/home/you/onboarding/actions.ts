"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { SetupActionState } from "./action-state";

import { isoDateInTimezone } from "@/lib/date/local-date";
import {
  assertTargetDateNotPast,
  GoalValidationError,
  parseGoalInput,
  type GoalInput,
} from "@/server/goals/goal-records";
import { MemoryValidationError } from "@/server/memory/memory-records";
import { keepSports } from "@/server/profile/keep-sports";
import { ProfileDetailsValidationError } from "@/server/profile/profile-records";
import {
  parseSetupNotes,
  parseSetupStepNumber,
} from "@/server/profile/training-setup-records";
import {
  createGoalRepository,
  GoalAuthenticationError,
  GoalConflictError,
  type Goal,
} from "@/server/repositories/goal-repository";
import {
  createMemoryRepository,
  MemoryAuthenticationError,
  MemoryConflictError,
} from "@/server/repositories/memory-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";

/**
 * Guided setup (owner, 5 and 6 Oct 2026). Every screen saves where its answer
 * lives. "About you", the sports and the training setup are the profile's and
 * are saved by `profile-actions`; this file has the two screens that are not:
 * goals, saved as goals, and what the coach should know, filed in Memory. It
 * also keeps where setup stands, which is three columns of the profile.
 *
 * Nothing waits in a draft and nothing is reviewed at the end, so there is no
 * draft to keep consistent: a screen that cannot be saved leaves the ones
 * before it saved.
 */

/** More rows than anyone fills in; it only bounds what a request can ask. */
const SETUP_GOALS_MAX = 20;

/**
 * "Continue later" (owner, 5 Oct 2026): setup's one way out besides
 * finishing. It records that the owner left, which is what makes the next
 * sign-in ask about setup instead of opening it, and the screen they were on.
 * Never in the way of leaving: a skip that cannot be recorded is not one.
 */
export async function leaveSetupAction(step?: number): Promise<never> {
  await recordSkip(step);
  redirect("/home/today");
}

/** The screen the owner moved to, so that setup reopens there. */
export async function recordSetupStepAction(step: number): Promise<void> {
  try {
    const profiles = await createProfileRepository();
    await profiles.saveSetupStep(parseSetupStepNumber(step));
  } catch {
    // Setup then reopens a screen earlier; nothing the owner saved is lost.
  }
}

/**
 * Setup begun from You by an account that never ran it. Done once, setup is
 * not started again (owner, 2 Oct 2026): `startSetup` leaves a finished
 * account as it is.
 */
export async function startSetupAction(): Promise<never> {
  try {
    await (await createProfileRepository()).startSetup();
  } catch {
    // The page then offers the same button again.
  }
  revalidatePath("/home/you/onboarding");
  redirect("/home/you/onboarding");
}

/**
 * The goals screen: each row with a title is a goal, saved as one. A row that
 * carries an id is a goal the account already has and is edited; the others
 * are created. What a goal stores beyond what setup asks stays as it was.
 */
export async function saveSetupGoalsAction(
  previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const leaving = formData.get("intent") === "later";
  const state = await saveGoals(previous, formData);
  if (leaving) return leaveSetupAction(stepOf(formData));
  return state;
}

async function saveGoals(
  previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const goalIds: (string | null)[] = [];
  const result = (
    status: SetupActionState["status"],
    message: string,
  ): SetupActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    goalIds,
  });

  try {
    const goals = await createGoalRepository();
    const collection = await goals.list();
    // Everything sent is checked before anything is written.
    const rows = parseGoalRows(formData, collection.goals);
    if (rows.every((row) => row === null)) throw new GoalValidationError();
    const dated = rows.filter((row) => row?.input.targetDate !== undefined);
    if (dated.length > 0) {
      const profile = await (await createProfileRepository()).getDetails();
      // A day needs a zone. Without a stored one it is UTC's.
      const today = isoDateInTimezone(
        new Date(),
        profile?.timezoneName ?? "UTC",
      );
      for (const row of dated) {
        assertTargetDateNotPast(
          row?.input.targetDate,
          row?.existing?.targetDate,
          today,
        );
      }
    }

    let revision = collection.revision;
    for (const row of rows) {
      if (row === null) {
        goalIds.push(null);
      } else if (row.existing && !row.changed) {
        goalIds.push(row.existing.id);
      } else {
        const receipt = row.existing
          ? await goals.edit(row.existing.id, row.input, revision)
          : await goals.create(row.input, revision);
        revision = receipt.collection_revision ?? revision + 1;
        goalIds.push(receipt.goal_id ?? row.existing?.id ?? null);
      }
    }
    // A sport made up on the goal screen joins the owner's sports.
    await keepSports(
      rows.flatMap((row) => (row === null ? [] : row.input.sports)),
    );
  } catch (error) {
    revalidate();
    if (error instanceof GoalValidationError) {
      return result(
        "validation",
        "Check each goal: it needs a title, a desired outcome and a sport, and a target date that is not before today.",
      );
    }
    if (error instanceof GoalConflictError) {
      return result(
        "conflict",
        error.reason === "core-limit"
          ? "At most three goals can be core. Make one of them supporting."
          : "Your goals changed in another tab. Reload and try again.",
      );
    }
    if (error instanceof GoalAuthenticationError) {
      return result(
        "session",
        "Your session ended. Sign in again before continuing setup.",
      );
    }
    return result(
      "error",
      "Your goals could not be saved. Reload and try again.",
    );
  }

  revalidate();
  return result("saved", "");
}

type GoalRow = { input: GoalInput; existing?: Goal; changed: boolean } | null;

function parseGoalRows(formData: FormData, saved: Goal[]): GoalRow[] {
  const count = Number(text(formData, "goalCount"));
  if (!Number.isInteger(count) || count < 1 || count > SETUP_GOALS_MAX) {
    throw new GoalValidationError();
  }
  return Array.from({ length: count }, (_, index): GoalRow => {
    const title = text(formData, `goalTitle:${index}`).trim();
    // A row added and left empty is not a goal.
    if (title === "") return null;
    const id = text(formData, `goalId:${index}`);
    const existing =
      id === "" ? undefined : saved.find((goal) => goal.id === id);
    // An id that is not one of the owner's goals was not put there by setup.
    if (id !== "" && !existing) throw new GoalValidationError();

    const priorityTier = text(formData, `goalTier:${index}`);
    const asked = {
      title,
      desiredOutcome: text(formData, `goalOutcome:${index}`),
      sports: text(formData, `goalActivities:${index}`)
        .split(",")
        .map((sport) => sport.trim())
        .filter(Boolean),
      targetDate: text(formData, `goalTargetDate:${index}`) || undefined,
      priorityTier,
    };
    // A goal names at least one sport, here as on Goals (owner, 5 Oct 2026):
    // `parseGoalInput` refuses one without.
    const input = parseGoalInput(
      existing
        ? {
            ...asked,
            // It keeps its place among its own kind, and is filed last
            // among the other kind when that is changed.
            targetRank:
              existing.priorityTier === priorityTier
                ? (existing.activeRank ?? undefined)
                : undefined,
          }
        : asked,
    );
    return {
      input,
      existing,
      // A goal sent back as it is saved is not written again, so the day it
      // was last changed stays the day it was.
      changed:
        existing === undefined ||
        existing.title !== input.title ||
        existing.desiredOutcome !== input.desiredOutcome ||
        existing.priorityTier !== input.priorityTier ||
        (existing.targetDate ?? undefined) !== input.targetDate ||
        existing.sports.join("\n") !== input.sports.join("\n"),
    };
  });
}

/**
 * Setup's last screen: what the owner wrote under each prompt is filed in
 * Memory, one item a field, as written and active at once (owner, 6 Oct
 * 2026). They wrote it, so there is nothing to accept. Then setup is done.
 *
 * Memory is written one item at a time, so a failure part way leaves the
 * earlier ones saved; text Memory already holds is passed over, which is what
 * makes pressing the button again safe.
 */
export async function finishSetupAction(
  previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const leaving = formData.get("intent") === "later";
  const state = await saveNotes(previous, formData, !leaving);
  if (leaving) return leaveSetupAction(stepOf(formData));
  // Straight back to You, which says setup is saved (owner, 2 Oct 2026).
  if (state.status === "saved") redirect("/home/you?setup=done");
  return state;
}

async function saveNotes(
  previous: SetupActionState,
  formData: FormData,
  finish: boolean,
): Promise<SetupActionState> {
  const result = (
    status: SetupActionState["status"],
    message: string,
  ): SetupActionState => ({
    status,
    message,
    submission: previous.submission + 1,
  });

  try {
    const notes = parseSetupNotes(formData);
    if (notes.length > 0) {
      const memory = await createMemoryRepository();
      const collection = await memory.list();
      // Only what Memory holds as active: text that matches an item set
      // aside earlier is wanted again and is filed anew.
      const held = new Set(
        collection.items
          .filter((item) => item.status === "active")
          .map((item) => item.content),
      );
      let revision = collection.revision;
      for (const note of notes) {
        if (held.has(note.content)) continue;
        const receipt = await memory.create(
          note.memoryType,
          note.content,
          undefined,
          revision,
        );
        revision = receipt.collection_revision ?? revision + 1;
      }
    }
    if (finish) await (await createProfileRepository()).finishSetup();
  } catch (error) {
    revalidate();
    if (
      error instanceof ProfileDetailsValidationError ||
      error instanceof MemoryValidationError
    ) {
      return result(
        "validation",
        "Check what you wrote: a field takes up to 300 characters.",
      );
    }
    if (error instanceof MemoryConflictError) {
      return result(
        "conflict",
        "Memory changed in another tab. Press Finish setup again.",
      );
    }
    if (
      error instanceof MemoryAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      return result(
        "session",
        "Your session ended. Sign in again before finishing setup.",
      );
    }
    return result(
      "error",
      "Setup could not be finished. Reload and try again.",
    );
  }

  revalidate();
  return result("saved", "");
}

async function recordSkip(step?: number): Promise<void> {
  try {
    const profiles = await createProfileRepository();
    await profiles.skipSetup(
      step === undefined ? undefined : parseSetupStepNumber(step),
    );
  } catch {
    // The next sign-in opens setup rather than asking; nothing is lost.
  }
}

/** The screen a form was sent from, when it says so. */
function stepOf(formData: FormData): number | undefined {
  const step = Number(text(formData, "setupStep"));
  return Number.isInteger(step) && step > 0 ? step : undefined;
}

function revalidate() {
  // The layout too: it marks "You" in the navigation while setup is open.
  revalidatePath("/home", "layout");
  revalidatePath("/home/today");
  revalidatePath("/home/you");
  revalidatePath("/home/you/onboarding");
  revalidatePath("/home/you/goals");
  revalidatePath("/home/you/memory");
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
