import type { ReactNode } from "react";

import { ConnectionNotice } from "@/components/home/connection-notice";
import { LiveWorkoutPill } from "@/components/home/live-workout-clock";
import { MobileNavigation } from "@/components/home/mobile-navigation";
import { OwnedSportsProvider } from "@/components/sports/owned-sports";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { readOpenDecisions } from "@/server/profile/open-decisions";
import { createLiveWorkouts } from "@/server/repositories/live-workout-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import {
  readRoadmapAttention,
  type RoadmapAttention,
} from "@/server/roadmap/roadmap-phases";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Read before anything is drawn, not streamed in behind a Suspense
  // boundary. That was tried on 6 Oct 2026 so the page would not wait for one
  // small read, and the first CI run with it lost a Server Action's answer
  // in the plan-proposal flow with "The destination stream closed early", an
  // error no earlier run had logged. One run proves nothing either way, so
  // the plainer form stays: every page under here already waits for the
  // same claims check and a read of its own.
  const {
    setupOpen,
    decisionsOpen,
    noGoal,
    roadmapAttention,
    sports,
    liveWorkout,
  } = await readShell();
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ConnectionNotice />
      <OwnedSportsProvider sports={sports}>{children}</OwnedSportsProvider>
      {/* After the page, so its room is below the content (owner, 21 Oct
          2026: the clock sits at the bottom, above the navigation). */}
      {liveWorkout === null ? null : <LiveWorkoutPill workout={liveWorkout} />}
      <MobileNavigation
        setupOpen={setupOpen}
        decisionsOpen={decisionsOpen}
        noGoal={noGoal}
        roadmapAttention={roadmapAttention}
      />
    </div>
  );
}

/**
 * Whether guided setup is still to be done or a coach suggestion waits, which
 * the navigation marks on "You" (owner, 6 and 19 Oct 2026), whether the
 * roadmap wants attention, which it marks on "Plan", and the owner's sports, offered wherever a sport
 * is typed (owner, 8 Oct 2026). Only a mark and a shortcut: if they cannot be
 * read, for a visitor who is not signed in or a database that does not
 * answer, there is neither, and the page under this layout says what is
 * wrong.
 */
async function readShell(): Promise<{
  setupOpen: boolean;
  decisionsOpen: boolean;
  noGoal: boolean;
  roadmapAttention: RoadmapAttention;
  sports: string[];
  liveWorkout: {
    title: string;
    startedAt: string;
    pausedAt: string | null;
    pausedSeconds: number;
  } | null;
}> {
  try {
    const shell = await (await createProfileRepository()).getHomeShell();
    // The owner's own day where one is knowable, UTC's otherwise, as the Plan
    // page reads it for the dot on its Roadmap chip.
    const today =
      shell.timezoneName === null
        ? new Date().toISOString().slice(0, 10)
        : isoDateInTimezone(new Date(), shell.timezoneName);
    // A suggestion left undecided marks You (owner, 19 Oct 2026), and a dot
    // on the Roadmap chip marks Plan.
    // A running workout's clock on every page (owner, 21 Oct 2026); like the
    // marks, only a shortcut, so a failed read shows none.
    const [decisions, roadmapAttention, liveWorkout] = await Promise.all([
      readOpenDecisions(),
      readRoadmapAttention(today).catch(() => null),
      createLiveWorkouts()
        .then((workouts) => workouts.current())
        .catch(() => null),
    ]);
    return {
      setupOpen: shell.setupOpen,
      decisionsOpen: decisions.goals || decisions.memory,
      noGoal: decisions.noGoal,
      roadmapAttention,
      sports: shell.sports,
      liveWorkout:
        liveWorkout === null
          ? null
          : {
              title: liveWorkout.title,
              startedAt: liveWorkout.startedAt,
              pausedAt: liveWorkout.pausedAt,
              pausedSeconds: liveWorkout.pausedSeconds,
            },
    };
  } catch {
    return {
      setupOpen: false,
      decisionsOpen: false,
      noGoal: false,
      roadmapAttention: null,
      sports: [],
      liveWorkout: null,
    };
  }
}
