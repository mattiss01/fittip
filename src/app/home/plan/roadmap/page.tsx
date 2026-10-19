import { redirect } from "next/navigation";

import styles from "./roadmap.module.css";

import homeStyles from "../../home.module.css";
import { SubPageHeader } from "../sub-page-header";
import { RoadmapNew } from "@/components/roadmap/roadmap-new";
import {
  RoadmapChangeCompose,
  RoadmapCompose,
  RoadmapScreen,
  RoadmapWrite,
} from "@/components/roadmap/roadmap-screen";
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
  ROADMAP_COPY,
  ROADMAP_MAX_REGENERATIONS,
  type RoadmapGoalSummary,
  type RoadmapScreenState,
} from "@/server/roadmap/roadmap-records";
import { roadmapReviewDue } from "@/server/roadmap/roadmap-reviews";
import { hasRecentSafetySignal } from "@/server/roadmap/roadmap-safety";
import { TRAINING_HISTORY_WINDOW_DAYS } from "@/server/training/training-history-context";

export const dynamic = "force-dynamic";

/** The headings that name the corner's sheet, one for each thing it shows. */
const SHEET_TITLE_IDS = {
  menu: "roadmap-change-menu-title",
  change: "roadmap-change-title",
  fresh: "roadmap-new-title",
  write: "roadmap-write-title",
  rewrite: "roadmap-write-title",
};

/**
 * The roadmap.
 *
 * This module still only reads. Everything the screen shows is read here, in
 * one owner-scoped pass, and handed down as one already-authorized
 * `RoadmapScreenState`; the writes live in `actions.ts` beside it, where each
 * one re-derives the owner from verified claims and revalidates this path.
 *
 * M3-15E reopened the route as a read surface because the five ADR-015
 * functions were revoked from every role, and it deliberately showed no
 * control rather than a disabled one — an owner cannot tell a button that is
 * waiting from one that is gone. M3-15F restores those grants, so the controls
 * on this surface are present and all of them work. None of them is gated on an
 * environment, and none appears without its capability.
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
      {/* Once there is a roadmap the page starts with it, and asking for
          another is this one button (owner, 13 Oct 2026). Not while a proposal
          awaits a decision: decide, then ask again. The version is on the
          roadmap's own line. */}
      <SubPageHeader
        title={ROADMAP_COPY.routeTitle}
        action={
          state.current === null || state.openProposal !== null ? undefined : (
            <RoadmapNew
              titleIds={SHEET_TITLE_IDS}
              change={
                <RoadmapChangeCompose
                  state={state}
                  headingId={SHEET_TITLE_IDS.change}
                />
              }
              fresh={
                <RoadmapCompose
                  state={state}
                  headingId={SHEET_TITLE_IDS.fresh}
                />
              }
              write={
                <RoadmapWrite state={state} headingId={SHEET_TITLE_IDS.write} />
              }
            />
          )
        }
      />
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

  const [profile, goalCollection, head, versions, reviewProposals, memory] =
    await Promise.all([
      profiles.getCurrentProfile(),
      goalRepository.list(),
      roadmaps.getHead(),
      roadmaps.listVersions(),
      roadmaps.getReviewProposals(),
      roadmaps.listOpenMemorySuggestions(),
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

  const current = versions[0] ?? null;
  // Two reads wait on the first pass, and not on each other. The marks are
  // those of the roadmap in force, and of no other: an earlier version's stay
  // stored and are not shown, as the version itself is not.
  const [completions, reached, reviewedThrough] = await Promise.all([
    createCompletionLog().then((log) =>
      log.list(shiftIsoDate(today, -(TRAINING_HISTORY_WINDOW_DAYS - 1)), today),
    ),
    current === null ? [] : roadmaps.listMilestoneMarks(current.id),
    current === null ? null : roadmaps.getReviewedThrough(current.id),
  ]);

  const goals: RoadmapGoalSummary[] = selectActiveGoalContext(
    goalCollection.goals,
  ).targetable.map((goal) => ({
    id: goal.id,
    title: goal.title,
    priorityTier: goal.priorityTier,
    targetDate: goal.targetDate,
  }));

  // ADR-032: a proposal naming one of these is accepted as it is, and says so.
  const otherGoalTitles = Object.fromEntries(
    goalCollection.goals
      .filter((goal) => goal.status !== "active")
      .map((goal) => [goal.id, goal.title]),
  );

  const { open: openProposal, declinedPredecessor } = reviewProposals;
  // While a proposal is open it is its own predecessor-in-waiting; once it is
  // declined it is the predecessor. The count a regeneration is offered against
  // is derived from the records rather than from whatever the browser
  // remembers; the database refuses a regeneration whose predecessor is not
  // owned, declined, and on the same horizon.
  const regenerationSource = openProposal ?? declinedPredecessor;

  return {
    today,
    head,
    current,
    reached,
    reviewedThrough,
    // A review is due from a phase's last day, by the owner's own calendar.
    reviewDue:
      current === null
        ? null
        : roadmapReviewDue(current.content.phases, today, reviewedThrough),
    openProposal,
    memory,
    goals,
    otherGoalTitles,
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
