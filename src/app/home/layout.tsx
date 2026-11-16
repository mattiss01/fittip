import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CoachAgreedProvider } from "@/components/consent/coach-agreed";
import { CoachConsentDialog } from "@/components/consent/coach-consent-dialog";
import { ConnectionNotice } from "@/components/home/connection-notice";
import { COACH_CONSENT_LATER_COOKIE } from "@/lib/coach-consent-cookie";
import { createConsents } from "@/server/repositories/consent-repository";
import { LiveWorkoutPill } from "@/components/home/live-workout-clock";
import { MobileNavigation } from "@/components/home/mobile-navigation";
import { OwnedSportsProvider } from "@/components/sports/owned-sports";
import type { OwnedSport } from "@/lib/sports/sport-colours";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { readUnloggedSessions } from "@/server/completions/unlogged-sessions";
import { readOpenDecisions } from "@/server/profile/open-decisions";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createLiveWorkouts } from "@/server/repositories/live-workout-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
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
  //
  // The Terms and the health consent come first (owner, 15 Nov 2026): until
  // both are given, nothing under /home opens.
  if ((await readTermsState()) === "undecided") redirect("/welcome");
  const {
    setupOpen,
    decisionsOpen,
    noGoal,
    roadmapAttention,
    unloggedOpen,
    sports,
    liveWorkout,
  } = await readShell();
  const coach = await readCoachConsent();
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ConnectionNotice />
      <CoachAgreedProvider agreed={coach.agreed}>
        <OwnedSportsProvider sports={sports}>{children}</OwnedSportsProvider>
      </CoachAgreedProvider>
      {/* After the page, so its room is below the content (owner, 21 Oct
          2026: the clock sits at the bottom, above the navigation). */}
      {liveWorkout === null ? null : <LiveWorkoutPill workout={liveWorkout} />}
      <MobileNavigation
        setupOpen={setupOpen}
        decisionsOpen={decisionsOpen}
        noGoal={noGoal}
        roadmapAttention={roadmapAttention}
        unloggedOpen={unloggedOpen}
      />
      {coach.ask ? <CoachConsentDialog /> : null}
    </div>
  );
}

/**
 * Whether the Terms and the health consent both stand, or "unknown" when
 * they cannot be read: signed out, not admitted, or a database that does not
 * answer. Those are the page's to explain, so the layout does not send them
 * to /welcome.
 */
async function readTermsState(): Promise<"agreed" | "undecided" | "unknown"> {
  try {
    const consents = await createConsents();
    const [terms, health] = await Promise.all([
      consents.current("terms"),
      consents.current("health"),
    ]);
    return terms.status === "agreed" && health.status === "agreed"
      ? "agreed"
      : "undecided";
  } catch {
    return "unknown";
  }
}

/**
 * The coach decision, for two things only (ADR-043 decision 5): whether to
 * ask about it, when no decision stands for the notice as it reads today and
 * ✕ was not pressed since the last sign-in (owner, 12 Nov 2026); and whether
 * its buttons are grey (owner, 15 Nov 2026). A failed read asks nothing and
 * leaves the buttons as they were: every coach call checks for itself.
 */
async function readCoachConsent(): Promise<{ ask: boolean; agreed: boolean }> {
  try {
    const consent = await (await createConsents()).current("coach");
    const postponed = (await cookies()).has(COACH_CONSENT_LATER_COOKIE);
    return {
      ask: consent.status === "undecided" && !postponed,
      agreed: consent.status === "agreed",
    };
  } catch {
    return { ask: false, agreed: true };
  }
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
  unloggedOpen: boolean;
  sports: OwnedSport[];
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
    // A past session with no log marks Today (owner, 5 Nov 2026), where the
    // reminder lists it. Without a confirmed zone there is no past to judge.
    const [decisions, roadmapAttention, liveWorkout, unlogged] =
      await Promise.all([
        readOpenDecisions(),
        readRoadmapAttention(today).catch(() => null),
        createLiveWorkouts()
          .then((workouts) => workouts.current())
          .catch(() => null),
        shell.timezoneName === null
          ? []
          : Promise.all([createRollingPlan(), createCompletionLog()])
              .then(([plan, log]) => readUnloggedSessions(plan, log, today))
              .catch(() => []),
      ]);
    return {
      setupOpen: shell.setupOpen,
      decisionsOpen: decisions.goals || decisions.memory,
      noGoal: decisions.noGoal,
      roadmapAttention,
      unloggedOpen: unlogged.length > 0,
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
      unloggedOpen: false,
      sports: [],
      liveWorkout: null,
    };
  }
}
