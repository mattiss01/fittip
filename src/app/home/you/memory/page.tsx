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

/**
 * The one place a memory item is decided, reached from more than one surface.
 *
 * The coach proposal links here with `from=plan-proposal`, and the back link
 * follows that rather than always pointing at You. Deciding a candidate is a
 * detour out of a review the owner is part-way through, and a detour with no
 * marked way back is how someone loses their place in seven days of proposed
 * sessions. The origin is read as a tag, never as a destination: an unknown
 * value falls through to You, so nothing here can be steered anywhere by a
 * crafted link.
 */
export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const cameFromPlanProposal = (await searchParams).from === "plan-proposal";
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
      <Link
        className={homeStyles.backLink}
        href={cameFromPlanProposal ? "/home/plan/proposal" : "/home/you"}
      >
        {cameFromPlanProposal ? "← Coach proposal" : "← You"}
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
