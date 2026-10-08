import type { ReactNode } from "react";

import { ConnectionNotice } from "@/components/home/connection-notice";
import { MobileNavigation } from "@/components/home/mobile-navigation";
import { OwnedSportsProvider } from "@/components/sports/owned-sports";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Read before anything is drawn, not streamed in behind a Suspense
  // boundary. That was tried on 6 Oct 2026 so the page would not wait for one
  // small read, and the first CI run with it lost a Server Action's answer
  // in the plan-proposal flow with "The destination stream closed early", an
  // error no earlier run had logged. One run proves nothing either way, so
  // the plainer form stays: every page under here already waits for the
  // same claims check and a read of its own.
  const { setupOpen, sports } = await readShell();
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ConnectionNotice />
      <OwnedSportsProvider sports={sports}>{children}</OwnedSportsProvider>
      <MobileNavigation setupOpen={setupOpen} />
    </div>
  );
}

/**
 * Whether guided setup is still to be done, which the navigation marks on
 * "You" (owner, 6 Oct 2026), and the owner's sports, offered wherever a sport
 * is typed (owner, 8 Oct 2026). Only a mark and a shortcut: if they cannot be
 * read, for a visitor who is not signed in or a database that does not
 * answer, there is neither, and the page under this layout says what is
 * wrong.
 */
async function readShell(): Promise<{ setupOpen: boolean; sports: string[] }> {
  try {
    return await (await createProfileRepository()).getHomeShell();
  } catch {
    return { setupOpen: false, sports: [] };
  }
}
