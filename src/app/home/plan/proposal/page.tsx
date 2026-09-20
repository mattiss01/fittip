import Link from "next/link";
import { redirect } from "next/navigation";

import { ComposeProposal } from "./compose-proposal";
import { FinishedProposal } from "./finished-proposal";
import styles from "./proposal.module.css";
import { ProposalReview } from "./proposal-review";
import {
  buildProposalTimeline,
  groupPlannedByDate,
  type PlannedSessionSummary,
} from "./proposal-timeline";

import homeStyles from "../../home.module.css";
import { isoDateInTimezone } from "@/lib/date/local-date";
import { PLAN_PROPOSAL_COPY } from "@/lib/plan/plan-proposal-copy";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import {
  isExampleProposal,
  stagedItemCount,
  unresolvedItemCount,
  type ProposalRoadmapView,
} from "@/lib/plan/plan-proposal-view";
import type { PlanProposalView } from "@/server/plan-proposal/plan-proposal-records";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import {
  createPlanProposalRepository,
  PlanProposalAuthenticationError,
} from "@/server/repositories/plan-proposal-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
} from "@/server/repositories/roadmap-repository";
import {
  createRollingPlan,
  RollingPlanAuthenticationError,
} from "@/server/repositories/rolling-plan-repository";
import { roadmapPlanStaleReasons } from "@/server/roadmap/roadmap-plan-context";

export const dynamic = "force-dynamic";

const COPY = PLAN_PROPOSAL_COPY;

/**
 * The coach proposal review.
 *
 * M3-11 left this route on the maintenance stub because there was nothing
 * behind it: the plan-proposal tables and every function that wrote them were
 * dropped. M3-16A puts the whole loop back — ask, review against what is
 * already planned, decide each day, apply in one atomic change — and this
 * module only reads. The writes live in `actions.ts` beside it, where each one
 * re-derives the owner from verified claims and revalidates this path.
 *
 * The timeline it renders is merged on purpose. A proposal read on its own
 * cannot show a clash, and a clash is the thing the owner most needs to see
 * before deciding: the coach was given the planned sessions as context, but
 * being told what it knew is not the same as seeing it beside what it said.
 */
export default async function PlanProposalPage() {
  let state: Awaited<ReturnType<typeof loadProposalState>>;
  try {
    state = await loadProposalState();
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <Link className={homeStyles.backLink} href="/home/plan">
        {COPY.backLink}
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>{COPY.routeKicker}</p>
          <h1>{COPY.routeTitle}</h1>
          <p className={homeStyles.intro}>{COPY.routeIntro}</p>
        </div>
      </header>

      {state.timezoneName === null ? (
        <p className={styles.notice} data-state="rule">
          {COPY.outcomes.timezoneRequired}
        </p>
      ) : (
        <>
          <ComposeProposal hasGoals={state.hasGoals} />
          {state.proposal === null ? (
            <section className={styles.emptyState}>
              <h2>{COPY.noProposalTitle}</h2>
              <p className={styles.support}>{COPY.noProposalSupport}</p>
            </section>
          ) : state.proposal.decision !== null ? (
            <FinishedProposal proposal={state.proposal} />
          ) : (
            <ProposalReview
              proposalId={state.proposal.id}
              expectedPlanRevision={state.planRevision}
              finishKey={state.finishKey}
              days={state.days}
              roadmap={state.roadmap}
              planChangedSinceComposed={state.planChangedSinceComposed}
              unresolved={unresolvedItemCount(state.proposal.items)}
              staged={stagedItemCount(state.proposal.items)}
              isExample={isExampleProposal(state.proposal.providerCode)}
            />
          )}
        </>
      )}
    </main>
  );
}

/**
 * One owner-scoped read pass.
 *
 * The profile is read first because the owner's today comes from their
 * confirmed zone and every later bound is measured against it. Nothing after it
 * depends on anything but the proposal's own horizon, so the rest are issued
 * together.
 */
async function loadProposalState() {
  const profiles = await createProfileRepository();
  const timezoneName =
    (await profiles.getCurrentProfile())?.timezoneName ?? null;
  if (timezoneName === null) {
    return {
      timezoneName,
      hasGoals: false,
      proposal: null,
      roadmap: null,
      planChangedSinceComposed: false,
      planRevision: 0,
      finishKey: "",
      days: [],
    };
  }

  const today = isoDateInTimezone(new Date(), timezoneName);
  const [proposals, plan, goals] = await Promise.all([
    createPlanProposalRepository(),
    createRollingPlan(),
    createGoalRepository(),
  ]);

  const [proposal, goalCollection] = await Promise.all([
    proposals.getLatestProposal(),
    goals.list(),
  ]);
  const targetable = selectActiveGoalContext(goalCollection.goals).targetable;
  const hasGoals = targetable.length > 0;
  // The goals a roadmap may still be pointed at. Same set the context source
  // checked when the proposal was made, read again now — which is the point:
  // a goal archived since is exactly what makes a roadmap stale.
  const targetableGoalIds = new Set(targetable.map((goal) => goal.id));

  // A finished proposal needs no plan read: it is shown as the record of what
  // was decided, not as a timeline to decide against.
  if (proposal === null || proposal.decision !== null) {
    return {
      timezoneName,
      hasGoals,
      proposal,
      roadmap: null,
      planChangedSinceComposed: false,
      planRevision: 0,
      finishKey: "",
      days: [],
    };
  }

  // The plan is read over the proposal's own horizon, not the plan window, so
  // the review shows exactly the days it is asking about. The roadmap lineage
  // is read beside it: the two are independent, and neither gates the other.
  const [slice, roadmapSource] = await Promise.all([
    plan.getPlanSlice(proposal.startDate, proposal.endDate),
    proposals.getRoadmapSource(proposal.id),
  ]);
  const planned = slice.sessions.map((session) => ({
    id: session.id,
    localDate: session.localDate,
    title: session.title,
    sport: session.sport,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    isLocked: session.isLocked,
    status: session.status,
    intent: session.intent ?? null,
    note: session.note ?? null,
    seriesId: session.seriesId ?? null,
  })) satisfies (PlannedSessionSummary & { localDate: string })[];

  // The roadmap this proposal was planned under, re-read as it is now rather
  // than as it was: the point of showing it is to say whether it still
  // describes the week, which yesterday's answer cannot.
  const roadmap =
    roadmapSource === null
      ? null
      : await readRoadmapStaleness(roadmapSource, proposal, targetableGoalIds);

  return {
    timezoneName,
    hasGoals,
    proposal,
    roadmap,
    // The plan moved after the coach saw it. Not a conflict and not a blocker:
    // the timeline below is read fresh on this very render, and the finish
    // revalidates under the lock regardless.
    planChangedSinceComposed:
      slice.revision !== proposal.composedAtPlanRevision,
    planRevision: slice.revision,
    finishKey: finishKeyFor(proposal, slice.revision),
    days: buildProposalTimeline({
      startDate: proposal.startDate,
      endDate: proposal.endDate,
      today,
      items: proposal.items,
      plannedSessions: planned,
      plannedByDate: groupPlannedByDate(planned),
      recoveryDates: slice.recoveryDates,
    }),
  };
}

/**
 * Whether the roadmap a proposal was planned under still describes the week.
 *
 * Recomputed from the current roadmap and the current goals rather than stored
 * with the proposal. Staleness is a relationship between a roadmap and today,
 * not a property the proposal has: a goal archived an hour ago makes a
 * proposal's roadmap stale without anything about the proposal changing.
 *
 * The version is matched by id. A roadmap accepted since the proposal was made
 * is a different version, and saying "planned under" about it would be false —
 * so that case reports the superseded fact rather than describing the new one.
 */
async function readRoadmapStaleness(
  source: { versionId: string; versionNumber: number },
  proposal: PlanProposalView,
  targetableGoalIds: ReadonlySet<string>,
): Promise<ProposalRoadmapView | null> {
  const current = await (await createRoadmapRepository()).getCurrentVersion();
  if (current === null || current.id !== source.versionId) {
    return {
      title: null,
      versionNumber: source.versionNumber,
      isSuperseded: true,
      staleReasons: [],
    };
  }

  const staleReasons = roadmapPlanStaleReasons({
    roadmap: current.content,
    horizonStartDate: proposal.startDate,
    horizonEndDate: proposal.endDate,
    targetableGoalIds,
  });

  return {
    title: current.content.title,
    versionNumber: current.versionNumber,
    isSuperseded: false,
    staleReasons,
  };
}

/**
 * The finish's idempotency key, derived rather than random.
 *
 * `apply_rolling_plan_change_set` refuses a reused key whose request differs, so
 * the key has to change when the request would: the staged set and the plan
 * revision both feed it. What it buys is that a retried or double-submitted
 * finish for an unchanged review replays the first one instead of being refused
 * as a key collision — and it is a UUID because the change function's parameter
 * is one.
 */
function finishKeyFor(
  proposal: PlanProposalView,
  planRevision: number,
): string {
  const staged = proposal.items
    .filter((item) => item.decision === "staged")
    .map((item) => item.ordinal)
    .join(",");
  return uuidFromSeed(`${proposal.id}:${planRevision}:${staged}`);
}

/**
 * A stable RFC-4122-shaped id from a seed string.
 *
 * It needs to be deterministic and well distributed across the seeds one owner
 * produces in one review, not unguessable: the key is scoped to the owner's own
 * rows by `auth.uid()`, and a collision between two owners is meaningless
 * because the uniqueness constraint is per user.
 */
function uuidFromSeed(seed: string): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + index), 0x85ebca6b) >>> 0;
  }
  const hex = (value: number) => value.toString(16).padStart(8, "0");
  const digits = `${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex((h1 + h2) >>> 0)}`;
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    `4${digits.slice(13, 16)}`,
    `8${digits.slice(17, 20)}`,
    digits.slice(20, 32),
  ].join("-");
}

/**
 * The same two exits every other plan route uses: the denied page for a signed-
 * in account that is not the allowed owner, and the sign-in form at `/` for
 * everyone else. There is no `/sign-in` route.
 */
function redirectOnAuthError(error: unknown): void {
  const authError =
    error instanceof ProfileAuthenticationError ||
    error instanceof PlanProposalAuthenticationError ||
    error instanceof RollingPlanAuthenticationError ||
    error instanceof GoalAuthenticationError ||
    // M3-16B added the roadmap read to this page. Without it here, a signed-out
    // owner would get a thrown error instead of the sign-in form, and only on
    // the roadmap read — the least likely one to be noticed.
    error instanceof RoadmapAuthenticationError
      ? error
      : null;
  if (authError === null) return;
  if (authError.accessError?.reason === "not-owner") redirect("/auth/denied");
  redirect("/");
}
