import Link from "next/link";
import { redirect } from "next/navigation";

import { RoadmapManager } from "@/components/roadmap/roadmap-manager";
import { RoadmapSpine } from "@/components/roadmap/roadmap-spine";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import { selectActiveMemoryContext } from "@/server/memory/memory-records";
import { utcIsoDate } from "@/server/memory/memory-records";
import { createCompletionRepository } from "@/server/repositories/completion-repository";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import {
  createRoadmapRepository,
  RoadmapAuthenticationError,
} from "@/server/repositories/roadmap-repository";
import {
  addDays,
  defaultRoadmapEndDate,
  goalsOutsideHorizon,
  ROADMAP_MAX_DAYS,
  ROADMAP_MAX_REGENERATIONS,
  ROADMAP_MIN_DAYS,
  type RoadmapGoalSummary,
} from "@/server/roadmap/roadmap-records";
import homeStyles from "../../home.module.css";
import styles from "./roadmap.module.css";

export const dynamic = "force-dynamic";

/**
 * The roadmap surface.
 *
 * Everything the screen needs is read here, in one owner-scoped pass, and
 * handed to the client component as one already-authorized snapshot. The client
 * issues no reads of its own — it cannot, because a client component may not
 * import a repository, and `server-boundary.test.ts` fails if one tries.
 *
 * The spine is rendered here rather than in the client component and passed
 * down as a node. It is static markup over content the server already holds, so
 * rendering it in the browser would ship it twice: once as the payload and
 * again as the JavaScript to rebuild it.
 */
export default async function RoadmapPage() {
  let view: Awaited<ReturnType<typeof loadRoadmapView>>;

  try {
    view = await loadRoadmapView();
  } catch (error) {
    if (
      (error instanceof RoadmapAuthenticationError ||
        error instanceof GoalAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof RoadmapAuthenticationError ||
      error instanceof GoalAuthenticationError
    ) {
      redirect("/");
    }
    throw error;
  }

  const { state, current, proposal, goalTitles } = view;

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
            Months of direction, not a week of sessions. Every roadmap here is a
            proposal until you accept it, and accepting one keeps the last.
          </p>
        </div>
        <p className={homeStyles.stamp}>
          {state.currentVersionNumber === null
            ? "No roadmap yet"
            : `Version ${state.currentVersionNumber}`}
        </p>
      </header>
      <RoadmapManager
        state={state}
        minDate={addDays(state.today, ROADMAP_MIN_DAYS)}
        maxDate={addDays(state.today, ROADMAP_MAX_DAYS)}
        currentSpine={
          current ? (
            <RoadmapSpine
              phases={current.content.phases}
              reviewPoints={current.content.reviewPoints}
              goalTitles={goalTitles}
            />
          ) : null
        }
        proposalSpine={
          proposal ? (
            <RoadmapSpine
              phases={proposal.content.phases}
              reviewPoints={proposal.content.reviewPoints}
              goalTitles={goalTitles}
            />
          ) : null
        }
      />
    </main>
  );
}

/**
 * One owner-scoped read pass, reduced to exactly what the client renders.
 *
 * No repository row, no source reference, and no planning note the screen does
 * not display travels in the payload.
 */
async function loadRoadmapView() {
  const [roadmaps, goalRepository, completions, memoryRepository] =
    await Promise.all([
      createRoadmapRepository(),
      createGoalRepository(),
      createCompletionRepository(),
      createMemoryRepository(),
    ]);

  const today = utcIsoDate();

  // Seven independent owner-scoped reads, issued together rather than as a
  // waterfall.
  const [
    head,
    versions,
    reviewProposals,
    openMemoryCandidates,
    goalCollection,
    memoryCollection,
    recent,
  ] = await Promise.all([
    roadmaps.getHead(),
    roadmaps.listVersions(),
    roadmaps.getReviewProposals(),
    roadmaps.countOpenMemoryCandidates(),
    goalRepository.list(),
    memoryRepository.list(today),
    completions.listCoachingCompletions(),
  ]);

  const eligible = selectActiveGoalContext(goalCollection.goals);
  const goals: RoadmapGoalSummary[] = eligible.targetable.map((goal) => ({
    id: goal.id,
    title: goal.title,
    priorityTier: goal.priorityTier,
    targetDate: goal.targetDate,
  }));

  // The compose disclosure states whether a symptom was reported, so the static
  // non-diagnostic copy appears before the owner generates rather than only
  // afterwards. Decision 7: it never blocks generation, and nothing here infers
  // severity or recovery from it.
  const windowStart = addDays(today, -55);
  const hasSafetySignal = recent.some(
    (entry) =>
      entry.actualLocalDate >= windowStart &&
      (entry.painReported ||
        entry.illnessReported ||
        entry.injuryReported ||
        entry.severeFatigueReported),
  );

  const { open: openProposal, declinedPredecessor } = reviewProposals;

  // The proposal a regeneration would carry, and the one whose round number the
  // remaining count is measured from. While a proposal is open it is its own
  // predecessor-in-waiting; once it is declined it is the predecessor, and the
  // screen keeps offering **Regenerate proposal** across a reload rather than
  // only for as long as the browser remembers the decline.
  const regenerationSource = openProposal ?? declinedPredecessor;

  const current = versions[0] ?? null;
  const defaultEndDate = defaultRoadmapEndDate(today, goals);
  const eligibleMemory = selectActiveMemoryContext(
    memoryCollection.items,
    today,
  );
  const goalTitles = Object.fromEntries(
    goals.map((goal) => [goal.id, goal.title]),
  );

  return {
    current,
    proposal: openProposal,
    goalTitles,
    state: {
      today,
      headRevision: head.revision,
      defaultEndDate,
      hasSafetySignal,
      regenerationsRemaining: regenerationSource
        ? Math.max(
            0,
            ROADMAP_MAX_REGENERATIONS - regenerationSource.regenerationNumber,
          )
        : ROADMAP_MAX_REGENERATIONS,
      // Present only once the predecessor exists and has been declined, which
      // is exactly when a regeneration is allowed to name it.
      regeneration: declinedPredecessor
        ? {
            previousProposalId: declinedPredecessor.id,
            endDate: declinedPredecessor.endDate,
            planningNote: declinedPredecessor.planningNote,
          }
        : null,
      openMemoryCandidateCount: openMemoryCandidates,
      goalSummary: {
        core: goals.filter((goal) => goal.priorityTier === "core").length,
        supporting: goals.filter((goal) => goal.priorityTier === "supporting")
          .length,
      },
      memoryCount: eligibleMemory.length,
      trainingSummary: {
        sessionsIncluded: recent.filter(
          (entry) => entry.actualLocalDate >= windowStart,
        ).length,
        windowStartDate: windowStart,
      },
      goalsOutsideHorizon: goalsOutsideHorizon(goals, defaultEndDate).map(
        (goal) => goal.title,
      ),
      currentVersionNumber: current?.versionNumber ?? null,
      currentTitle: current?.content.title ?? null,
      historyCount: Math.max(0, versions.length - 1),
      proposal: openProposal
        ? {
            id: openProposal.id,
            title: openProposal.content.title,
            summary: openProposal.content.summary,
            startDate: openProposal.startDate,
            endDate: openProposal.endDate,
            planningNote: openProposal.planningNote,
            regenerationNumber: openProposal.regenerationNumber,
            assumptions: openProposal.content.assumptions ?? [],
            uncertainties: openProposal.content.uncertainties ?? [],
            safetyConsiderations:
              openProposal.content.safetyConsiderations ?? [],
            reviewPoints: (openProposal.content.reviewPoints ?? []).map(
              (point) => ({
                title: point.title,
                triggerDate: point.triggerDate ?? null,
                triggerCondition: point.triggerCondition ?? null,
                question: point.question,
              }),
            ),
            content: openProposal.content,
          }
        : null,
    },
  };
}
