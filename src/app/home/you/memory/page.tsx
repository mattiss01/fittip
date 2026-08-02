import Link from "next/link";
import { redirect } from "next/navigation";

import { MemoryManager } from "@/components/memory/memory-manager";
import {
  createMemoryRepository,
  MemoryAuthenticationError,
} from "@/server/repositories/memory-repository";
import homeStyles from "../../home.module.css";
import styles from "./memory.module.css";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  let collection;
  try {
    collection = await (await createMemoryRepository()).list();
  } catch (error) {
    if (
      error instanceof MemoryAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof MemoryAuthenticationError) redirect("/");
    throw error;
  }

  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <Link className={homeStyles.backLink} href="/home/you">
        ← You
      </Link>
      <header className={homeStyles.masthead}>
        <div>
          <p className={homeStyles.kicker}>FitTip / you / memory</p>
          <h1>What FitTip knows.</h1>
          <p className={homeStyles.intro}>
            Every statement below is filed, stamped with where it came from, and
            yours to edit, disable or delete. Nothing here is inferred behind
            your back.
          </p>
        </div>
        <p className={homeStyles.stamp}>Collection {collection.revision}</p>
      </header>
      <MemoryManager
        items={collection.items}
        expectedRevision={collection.revision}
        today={collection.today}
      />
    </main>
  );
}
