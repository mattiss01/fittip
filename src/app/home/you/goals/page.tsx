import Link from "next/link";
import { redirect } from "next/navigation";

import { GoalManager } from "@/components/goals/goal-manager";
import {
  createGoalRepository,
  GoalAuthenticationError,
} from "@/server/repositories/goal-repository";
import homeStyles from "../../home.module.css";
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
      <Link className={homeStyles.backLink} href="/home/you">
        ← You
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / you / goals</p>
          <h1>Direct your attention.</h1>
          <p className={homeStyles.intro}>
            Rank the outcomes that matter now. Core goals receive primary
            attention; supporting goals remain visible without taking a core
            slot.
          </p>
        </div>
        <p className={homeStyles.stamp}>Collection {collection.revision}</p>
      </header>
      <GoalManager
        expectedRevision={collection.revision}
        initialGoals={collection.goals}
      />
    </main>
  );
}
