import { Suspense, type ReactNode } from "react";

import { ConnectionNotice } from "@/components/home/connection-notice";
import { MobileNavigation } from "@/components/home/mobile-navigation";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ConnectionNotice />
      {children}
      {/* The page is not kept waiting for the mark: the navigation is there
          at once and gains its dot when the answer comes. */}
      <Suspense fallback={<MobileNavigation />}>
        <MarkedNavigation />
      </Suspense>
    </div>
  );
}

async function MarkedNavigation() {
  return <MobileNavigation setupOpen={await isSetupOpen()} />;
}

/**
 * Whether guided setup is still to be done, which the navigation marks on
 * "You" (owner, 6 Oct 2026). Only a mark: if it cannot be read, for a visitor
 * who is not signed in or a database that does not answer, there is none, and
 * the page under this layout says what is wrong.
 */
async function isSetupOpen(): Promise<boolean> {
  try {
    return !(await (await createProfileRepository()).getSetupState()).finished;
  } catch {
    return false;
  }
}
