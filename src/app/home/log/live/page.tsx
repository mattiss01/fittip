import Link from "next/link";
import { redirect } from "next/navigation";

import { startLiveWorkoutAction } from "./actions";
import { LiveWorkout } from "./live-workout";
import styles from "./live.module.css";

import homeStyles from "../../home.module.css";
import { readLibraryOptions } from "../../plan/activities/library-options";
import { readMeasurementHistory } from "../../plan/activities/measurement-history";
import { SportInput } from "@/components/sports/sport-input";
import {
  plannedInstructions,
  type LiveWorkoutView,
} from "@/lib/training/live-workout";
import { PersonalActivityAuthenticationError } from "@/server/repositories/personal-activity-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
import {
  createLiveWorkouts,
  LiveWorkoutAuthenticationError,
} from "@/server/repositories/live-workout-repository";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    new?: string | string[];
    invalid?: string | string[];
  }>;
};

/**
 * The workout in progress (ADR-037), or the way to start one from scratch.
 * One runs at a time, so this page is always about that one; a planned
 * session is started from Today or its own page.
 */
export default async function LiveWorkoutPage({ searchParams }: Props) {
  const params = await searchParams;
  let workout: LiveWorkoutView | null;
  let library: Awaited<ReturnType<typeof readLibraryOptions>> = [];
  let modes: Awaited<ReturnType<typeof readMeasurementHistory>> = {};
  let plannedInstructions: Record<number, string> = {};
  try {
    workout = await (await createLiveWorkouts()).current();
    if (workout !== null) {
      [library, modes, plannedInstructions] = await Promise.all([
        readLibraryOptions(),
        readMeasurementHistory(),
        readPlannedInstructions(workout),
      ]);
    }
  } catch (error) {
    if (
      error instanceof LiveWorkoutAuthenticationError ||
      error instanceof PersonalActivityAuthenticationError
    ) {
      if (error.accessError?.reason === "not-owner") redirect("/auth/denied");
      redirect("/");
    }
    throw error;
  }

  if (workout !== null) {
    return (
      <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
        <LiveWorkout
          workout={workout}
          library={library}
          modes={modes}
          plannedInstructions={plannedInstructions}
        />
      </main>
    );
  }

  if (params.new === "1") {
    return (
      <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
        <section className={styles.startCard} data-live-start>
          <p className={homeStyles.sectionLabel}>Not planned</p>
          <h1>Start a workout</h1>
          <p>
            The clock starts when you press Start. Add what you do as you go;
            when you finish, the log opens filled in.
          </p>
          {params.invalid === "1" ? (
            <p className={styles.saveProblem} role="alert">
              Give it a name and a sport.
            </p>
          ) : null}
          <form action={startLiveWorkoutAction} className={styles.startForm}>
            <label className={styles.field}>
              <span>What is it?</span>
              <input
                name="title"
                required
                maxLength={120}
                placeholder="Gym, evening"
              />
            </label>
            <div className={styles.field}>
              <label htmlFor="live-sport">Sport</label>
              <SportInput id="live-sport" name="sport" required />
            </div>
            <button type="submit" className={styles.finishWide}>
              ▶ Start
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <section className={homeStyles.stateCard} data-live-state="none">
        <p className={homeStyles.sectionLabel}>No workout running</p>
        <h2>Nothing is being tracked</h2>
        <p>
          It was finished or discarded. Start one from a session on Today, or
          from scratch.
        </p>
        <div className={homeStyles.actions}>
          <Link className={homeStyles.primaryAction} href="/home/today">
            Open Today
          </Link>
          <Link
            className={homeStyles.secondaryAction}
            href="/home/log/live?new=1"
          >
            Start from scratch
          </Link>
        </div>
      </section>
    </main>
  );
}

/**
 * The planned session's instructions, by the position each activity answers
 * (owner, 9 Nov 2026): read as the page renders rather than copied into the
 * workout, whose stored state is capped at 64 KB and could not hold fifty
 * activities' 2,000 characters each. The session is on the owner's own date
 * the workout started, which is within a day of its UTC date either way.
 */
async function readPlannedInstructions(
  workout: LiveWorkoutView,
): Promise<Record<number, string>> {
  if (workout.planSessionId === null) return {};
  const started = new Date(workout.startedAt).valueOf();
  const day = (offset: number) =>
    new Date(started + offset * 86_400_000).toISOString().slice(0, 10);
  let slice;
  try {
    slice = await (await createRollingPlan()).getPlanSlice(day(-1), day(1));
  } catch {
    // Instructions are a help, not the workout: one that cannot be read
    // leaves the cards without them rather than the page down.
    return {};
  }
  const session = slice.sessions.find(
    (candidate) => candidate.id === workout.planSessionId,
  );
  return plannedInstructions(
    workout.state.activities,
    session?.activities ?? [],
  );
}
