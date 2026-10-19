import { redirect } from "next/navigation";

import { GoalManager, type GoalView } from "@/components/goals/goal-manager";
import { GoalSuggestions } from "@/components/goals/goal-suggestions";
import {
  createGoalSuggestions,
  GoalSuggestionAuthenticationError,
  type OpenGoalSuggestions,
} from "@/server/repositories/goal-suggestion-repository";
import { isoDateInTimezone } from "@/lib/date/local-date";
import {
  createGoalRepository,
  GoalAuthenticationError,
  type Goal,
  type GoalStatusChange,
} from "@/server/repositories/goal-repository";
import {
  createProfileRepository,
  ProfileAuthenticationError,
} from "@/server/repositories/profile-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import youStyles from "../you.module.css";
import styles from "./goals.module.css";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  let collection;
  let changes: GoalStatusChange[];
  let timezoneName: string;
  let suggested: OpenGoalSuggestions;
  try {
    const [goals, profiles, suggestions] = await Promise.all([
      createGoalRepository(),
      createProfileRepository(),
      createGoalSuggestions(),
    ]);
    const [list, latest, profile, open] = await Promise.all([
      goals.list(),
      goals.listStatusChanges(),
      profiles.getCurrentProfile(),
      suggestions.listOpen(),
    ]);
    suggested = open;
    collection = list;
    changes = latest;
    // A day needs a zone. Without a stored one the log's own, UTC, is used.
    timezoneName = profile?.timezoneName ?? "UTC";
  } catch (error) {
    if (
      (error instanceof GoalAuthenticationError ||
        error instanceof ProfileAuthenticationError ||
        error instanceof GoalSuggestionAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof GoalAuthenticationError ||
      error instanceof ProfileAuthenticationError ||
      error instanceof GoalSuggestionAuthenticationError
    ) {
      redirect("/");
    }
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <BackLink href="/home/you" label="You" />
      {/* No intro: the two lists below are headed Core goals and
          Supporting goals, which is all the old one said. */}
      <header className={youStyles.header}>
        <h1>Goals</h1>
      </header>
      {/* The coach's suggestions waiting on the owner (ADR-034), above the
          goals they would join. Gone once each is decided. */}
      {suggested.suggestions.length === 0 ? null : (
        <section className={styles.suggestions} data-goal-suggestions>
          <h2>Suggested by the coach</h2>
          <GoalSuggestions
            suggestions={suggested.suggestions}
            expectedGoalRevision={suggested.goalRevision}
          />
        </section>
      )}
      <GoalManager
        expectedRevision={collection.revision}
        today={isoDateInTimezone(new Date(), timezoneName)}
        initialGoals={collection.goals.map((goal) =>
          withStatusDate(goal, changes, timezoneName),
        )}
      />
    </main>
  );
}

/**
 * The day a goal entered the status it has now, in the owner's zone: the
 * moment it was achieved, or for a paused or abandoned goal its last change.
 * Read with the status it had then, and used only while the goal still has it.
 */
function withStatusDate(
  goal: Goal,
  changes: readonly GoalStatusChange[],
  timezoneName: string,
): GoalView {
  const change = changes.find((candidate) => candidate.goalId === goal.id);
  const at =
    goal.status !== "active" && change?.status === goal.status
      ? change.changedAt
      : null;
  return {
    ...goal,
    statusDate:
      at === null ? null : isoDateInTimezone(new Date(at), timezoneName),
  };
}
