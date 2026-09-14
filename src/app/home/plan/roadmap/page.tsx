import Link from "next/link";
import { redirect } from "next/navigation";

import styles from "./roadmap.module.css";

import homeStyles from "../../home.module.css";
import { RoadmapScreen } from "@/components/roadmap/roadmap-screen";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import {
  CompletionAuthenticationError,
  createCompletionLog,
} from "@/server/repositories/completion-log-repository";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
} from "@/server/repositories/roadmap-repository";
import {
  defaultRoadmapEndDate,
  ROADMAP_MAX_REGENERATIONS,
  type RoadmapGoalSummary,
  type RoadmapScreenState,
} from "@/server/roadmap/roadmap-records";
import { hasRecentSafetySignal } from "@/server/roadmap/roadmap-safety";
import { TRAINING_HISTORY_WINDOW_DAYS } from "@/server/training/training-history-context";

export const dynamic = "force-dynamic";

/**
 * The roadmap, read.
 *
 * M3-15E reopens this route from the M3-11 maintenance stub as a read surface
 * and nothing else. Everything the screen shows is read here, in one
 * owner-scoped pass, and handed down as one already-authorized
 * `RoadmapScreenState`. There is no Server Action, no form, and no cache
 * invalidation anywhere in this directory, because there is nothing here to
 * invalidate: generating, accepting, declining and editing a roadmap are
 * M3-15F, and the five ADR-015 functions that would do any of it stay revoked
 * from every role until that ticket restores them deliberately.
 *
 * That is also why no control on this surface is merely disabled. A greyed-out
 * "Generate roadmap proposal" would promise a capability that does not exist,
 * and an owner cannot tell a button that is waiting from one that is gone.
 */
export default async function RoadmapPage() {
  let state: RoadmapScreenState;

  try {
    state = await loadRoadmapState();
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <Link className={homeStyles.backLink} href="/home/plan">
        ← Plan
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / plan / roadmap</p>
          <h1>Where this is going.</h1>
          <p className={homeStyles.intro}>
            Months of direction, not a week of sessions. This is the roadmap you
            have now, every version before it, and what was proposed along the
            way.
          </p>
        </div>
        <p className={homeStyles.stamp}>
          {state.current === null
            ? "No roadmap yet"
            : `Version ${state.current.versionNumber}`}
        </p>
      </header>
      <RoadmapScreen state={state} />
    </main>
  );
}

/**
 * One owner-scoped read pass.
 *
 * Five of the six reads are independent and are issued together. The sixth is
 * not: the completion window is bounded by the owner's own today, and today
 * comes from the confirmed time zone, so it waits for the profile rather than
 * guessing a window and correcting it afterwards.
 *
 * No read here needs a privilege the owner does not already have.
 * `roadmap_heads`, `roadmap_versions` and `roadmap_proposals` are read under
 * the owner `SELECT` policy, and every factory derives its own owner from the
 * verified session — none of them accepts an owner id, and this function has
 * none to give.
 */
async function loadRoadmapState(): Promise<RoadmapScreenState> {
  const [roadmaps, goalRepository, profiles] = await Promise.all([
    createRoadmapRepository(),
    createGoalRepository(),
    createProfileRepository(),
  ]);

  const [
    profile,
    goalCollection,
    head,
    versions,
    reviewProposals,
    openMemoryCandidateCount,
  ] = await Promise.all([
    profiles.getCurrentProfile(),
    goalRepository.list(),
    roadmaps.getHead(),
    roadmaps.listVersions(),
    roadmaps.getReviewProposals(),
    roadmaps.countOpenMemoryCandidates(),
  ]);

  // The owner's own calendar date where one is knowable. An unconfirmed zone
  // falls back to UTC rather than hiding the roadmap behind a zone prompt: a
  // roadmap spans months, so the only thing the fallback can shift is which
  // day the 8-week safety window ends on, and refusing to show an accepted
  // roadmap over that would be the larger error.
  const today =
    profile?.timezoneName == null
      ? new Date().toISOString().slice(0, 10)
      : isoDateInTimezone(new Date(), profile.timezoneName);

  const completions = await (
    await createCompletionLog()
  ).list(shiftIsoDate(today, -(TRAINING_HISTORY_WINDOW_DAYS - 1)), today);

  const goals: RoadmapGoalSummary[] = selectActiveGoalContext(
    goalCollection.goals,
  ).targetable.map((goal) => ({
    id: goal.id,
    title: goal.title,
    priorityTier: goal.priorityTier,
    targetDate: goal.targetDate,
  }));

  const { open: openProposal, declinedPredecessor, history } = reviewProposals;
  // While a proposal is open it is its own predecessor-in-waiting; once it is
  // declined it is the predecessor. Read-only here, and carried so that the
  // count M3-15F offers a regeneration against is derived from the records
  // rather than from whatever the browser remembers.
  const regenerationSource = openProposal ?? declinedPredecessor;

  return {
    today,
    head,
    current: versions[0] ?? null,
    history: versions,
    openProposal,
    proposalHistory: history,
    openMemoryCandidateCount,
    goals,
    defaultEndDate: defaultRoadmapEndDate(today, goals),
    hasSafetySignal: hasRecentSafetySignal(completions, today),
    regenerationsRemaining: regenerationSource
      ? Math.max(
          0,
          ROADMAP_MAX_REGENERATIONS - regenerationSource.regenerationNumber,
        )
      : ROADMAP_MAX_REGENERATIONS,
  };
}

/**
 * Signed out goes home; a session that is authenticated but not this owner
 * goes to the denial. Every `/home` route behaves this way, and the roadmap
 * gains no exception — the four repositories it reads raise their own
 * authentication error and each carries the same access reason.
 */
function redirectOnAuthError(error: unknown): void {
  const authError =
    error instanceof RoadmapAuthenticationError ||
    error instanceof GoalAuthenticationError ||
    error instanceof ProfileAuthenticationError ||
    error instanceof CompletionAuthenticationError
      ? error
      : null;
  if (authError === null) return;
  if (authError.accessError?.reason === "not-owner") redirect("/auth/denied");
  redirect("/");
}
