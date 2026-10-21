"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isoDateInTimezone } from "@/lib/date/local-date";
import {
  liveActivityFrom,
  type LiveWorkoutView,
} from "@/lib/training/live-workout";
import {
  LiveWorkoutConflictError,
  LiveWorkoutRunningError,
  LiveWorkoutValidationError,
} from "@/server/live-workout/live-workout";
import {
  createLiveWorkouts,
  LiveWorkoutAuthenticationError,
} from "@/server/repositories/live-workout-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";

const LIVE_PATH = "/home/log/live";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What a save or a pause tells the screen. */
export type LiveSaveResult =
  | { status: "saved"; workout: LiveWorkoutView }
  | { status: "conflict" | "invalid" | "session" | "error" };

/**
 * Starts a workout: from a planned session, its activities copied by value
 * (the plan is never written), or from scratch with a name and a sport. One
 * runs at a time, so a second start leads to the one running instead.
 */
export async function startLiveWorkoutAction(formData: FormData) {
  const workouts = await createLiveWorkouts();
  try {
    const sessionId = formData.get("plannedSessionId");
    if (typeof sessionId === "string" && sessionId !== "") {
      if (!UUID.test(sessionId)) throw new LiveWorkoutValidationError();
      // Started on the owner's own today, where the session must be: a
      // workout is training as it happens.
      const profile = await (
        await createProfileRepository()
      ).getCurrentProfile();
      if (profile?.timezoneName == null) redirect("/home/today");
      const today = isoDateInTimezone(new Date(), profile.timezoneName);
      const slice = await (
        await createRollingPlan()
      ).getPlanSlice(today, today);
      const session = slice.sessions.find((s) => s.id === sessionId);
      if (session === undefined) throw new LiveWorkoutValidationError();
      await workouts.start({
        planSessionId: session.id,
        title: session.title,
        sport: session.sport,
        state: {
          activities: session.activities
            .toSorted((left, right) => left.position - right.position)
            .map((activity) =>
              liveActivityFrom({
                plannedPosition: activity.position,
                personalActivityId: activity.personalActivityId ?? null,
                name: activity.name,
                sport: activity.sport,
                measurementMode: activity.measurementMode,
                target: activity.target ?? null,
              }),
            ),
        },
      });
    } else {
      await workouts.start({
        planSessionId: null,
        title: String(formData.get("title") ?? ""),
        sport: String(formData.get("sport") ?? ""),
        state: { activities: [] },
      });
    }
  } catch (error) {
    if (error instanceof LiveWorkoutAuthenticationError) redirect("/");
    if (error instanceof LiveWorkoutValidationError) {
      redirect(`${LIVE_PATH}?new=1&invalid=1`);
    }
    // One is already running: that is the one to go back to.
    if (!(error instanceof LiveWorkoutRunningError)) throw error;
  }
  revalidatePath("/home", "layout");
  redirect(LIVE_PATH);
}

export async function saveLiveWorkoutAction(
  id: string,
  expectedRevision: number,
  state: unknown,
): Promise<LiveSaveResult> {
  return await settle(async (workouts) =>
    workouts.saveState(readId(id), readRevision(expectedRevision), state),
  );
}

export async function pauseLiveWorkoutAction(
  id: string,
  expectedRevision: number,
  paused: boolean,
): Promise<LiveSaveResult> {
  const result = await settle(async (workouts) =>
    workouts.setPaused(
      readId(id),
      readRevision(expectedRevision),
      paused === true,
    ),
  );
  // The clock on every page reads the pause from the layout.
  revalidatePath("/home", "layout");
  return result;
}

/** Discard: nothing is logged, and the workout is gone. */
export async function discardLiveWorkoutAction(formData: FormData) {
  try {
    await (await createLiveWorkouts()).discard(readId(formData.get("id")));
  } catch (error) {
    if (error instanceof LiveWorkoutAuthenticationError) redirect("/");
    throw error;
  }
  revalidatePath("/home", "layout");
  redirect("/home/today");
}

async function settle(
  write: (
    workouts: Awaited<ReturnType<typeof createLiveWorkouts>>,
  ) => Promise<LiveWorkoutView>,
): Promise<LiveSaveResult> {
  try {
    return {
      status: "saved",
      workout: await write(await createLiveWorkouts()),
    };
  } catch (error) {
    if (error instanceof LiveWorkoutConflictError)
      return { status: "conflict" };
    if (error instanceof LiveWorkoutValidationError)
      return { status: "invalid" };
    if (error instanceof LiveWorkoutAuthenticationError) {
      return { status: "session" };
    }
    return { status: "error" };
  }
}

function readId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new LiveWorkoutValidationError();
  }
  return value;
}

function readRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new LiveWorkoutValidationError();
  }
  return value as number;
}
