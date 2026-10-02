import { redirect } from "next/navigation";

import { GoalManager } from "@/components/goals/goal-manager";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import youStyles from "../you.module.css";
import styles from "./goals.module.css";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  let collection;
  try {
    collection = await (await createGoalRepository()).list();
  } catch (error) {
    if (
      error instanceof GoalAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof GoalAuthenticationError) redirect("/");
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
        initialGoals={collection.goals}
      />
    </main>
  );
}
