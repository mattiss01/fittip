import { redirect } from "next/navigation";

import { GoalManager, type GoalView } from "@/components/goals/goal-manager";
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
  try {
    const [goals, profiles] = await Promise.all([
      createGoalRepository(),
      createProfileRepository(),
    ]);
    const [list, latest, profile] = await Promise.all([
      goals.list(),
      goals.listStatusChanges(),
      profiles.getCurrentProfile(),
    ]);
    collection = list;
    changes = latest;
    // A day needs a zone. Without a stored one the log's own, UTC, is used.
    timezoneName = profile?.timezoneName ?? "UTC";
  } catch (error) {
    if (
      (error instanceof GoalAuthenticationError ||
        error instanceof ProfileAuthenticationError) &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (
      error instanceof GoalAuthenticationError ||
      error instanceof ProfileAuthenticationError
    ) {
      redirect("/");
    }
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <BackLink href="/home/you" label="You" />
      {/* No intro: the two lists below name themselves as primary and
          secondary attention, which is all the old one said. */}
      <header className={youStyles.header}>
        <h1>Goals</h1>
      </header>
      <GoalManager
        expectedRevision={collection.revision}
        initialGoals={collection.goals.map((goal) =>
          withStatusDate(goal, changes, timezoneName),
        )}
      />
    </main>
  );
}

/**
 * The day a goal entered the status it has now, in the owner's zone. An
 * archive has its own timestamp; the others are the goal's last change, read
 * with the status it had then, and used only while the goal still has it.
 */
function withStatusDate(
  goal: Goal,
  changes: readonly GoalStatusChange[],
  timezoneName: string,
): GoalView {
  const change = changes.find((candidate) => candidate.goalId === goal.id);
  const at =
    goal.archivedAt ??
    (goal.status !== "active" && change?.status === goal.status
      ? change.changedAt
      : null);
  return {
    ...goal,
    statusDate:
      at === null ? null : isoDateInTimezone(new Date(at), timezoneName),
  };
}
