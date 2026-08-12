import Link from "next/link";
import { redirect } from "next/navigation";

import homeStyles from "@/app/home/home.module.css";
import styles from "@/app/home/plan/proposal/proposal.module.css";
import { PlanProposalDays } from "@/components/plan-proposal/plan-proposal-days";
import { PlanProposalManager } from "@/components/plan-proposal/plan-proposal-manager";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import {
  selectActiveMemoryContext,
  utcIsoDate,
} from "@/server/memory/memory-records";
import { createCompletionRepository } from "@/server/repositories/completion-repository";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import {
  createPlanProposalRepository,
  PlanProposalAuthenticationError,
} from "@/server/repositories/plan-proposal-repository";

export const dynamic = "force-dynamic";

export default async function PlanProposalPage() {
  let view: Awaited<ReturnType<typeof loadPlanProposalView>>;
  try {
    view = await loadPlanProposalView();
  } catch (error) {
    if (
      (error instanceof PlanProposalAuthenticationError ||
        error instanceof GoalAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    )
      redirect("/auth/denied");
    if (
      error instanceof PlanProposalAuthenticationError ||
      error instanceof GoalAuthenticationError
    )
      redirect("/");
    throw error;
  }

  const proposal = view.proposal;
  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <Link className={homeStyles.backLink} href="/home/plan">
        ← Plan
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / plan / proposal</p>
          <h1>Make the days legible.</h1>
          <p className={homeStyles.intro}>
            A coach-shaped draft across the dates you choose. Every day stays
            visible, including rest.
          </p>
        </div>
        <p className={homeStyles.stamp}>
          {proposal ? "Proposal ready" : "Nothing accepted"}
        </p>
      </header>
      <PlanProposalManager
        rememberedDayCount={view.rememberedDayCount}
        contextSummary={view.contextSummary}
        openMemoryCandidateCount={view.openMemoryCandidateCount}
        proposal={
          proposal
            ? {
                id: proposal.id,
                weekDescription: proposal.content.weekDescription,
                assumptions: proposal.content.assumptions ?? [],
                uncertainties: proposal.content.uncertainties ?? [],
                safetyConsiderations:
                  proposal.content.safetyConsiderations ?? [],
              }
            : null
        }
        proposalDays={
          proposal ? (
            <PlanProposalDays
              proposal={proposal.content}
              goalTitles={view.goalTitles}
            />
          ) : null
        }
      />
    </main>
  );
}

async function loadPlanProposalView() {
  const [proposals, goals, memory, completions] = await Promise.all([
    createPlanProposalRepository(),
    createGoalRepository(),
    createMemoryRepository(),
    createCompletionRepository(),
  ]);
  const today = utcIsoDate();
  const [
    proposal,
    rememberedDayCount,
    openMemoryCandidateCount,
    goalCollection,
    memoryCollection,
    recent,
  ] = await Promise.all([
    proposals.getOpenProposal(),
    proposals.getRememberedDayCount(),
    proposals.countOpenMemoryCandidates(),
    goals.list(),
    memory.list(today),
    completions.listCoachingCompletions(),
  ]);
  const activeGoals = selectActiveGoalContext(goalCollection.goals).targetable;
  const activeMemory = selectActiveMemoryContext(memoryCollection.items, today);
  return {
    proposal,
    rememberedDayCount: rememberedDayCount ?? 7,
    openMemoryCandidateCount,
    goalTitles: Object.fromEntries(
      activeGoals.map((goal) => [goal.id, goal.title]),
    ),
    contextSummary: {
      goals: activeGoals.length,
      memory: activeMemory.length,
      recentSessions: recent.length,
    },
  };
}
