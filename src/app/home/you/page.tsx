import { redirect } from "next/navigation";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { createServerUserClient } from "@/lib/supabase/server-user-client";
import {
  ProfileAuthenticationError,
  ProfileRepository,
} from "@/server/repositories/profile-repository";
import homeStyles from "../home.module.css";
import styles from "./you.module.css";

export const dynamic = "force-dynamic";

/**
 * Where finishing setup lands. The flag only chooses which fixed sentence is
 * shown; nothing else is read from it.
 */
const SETUP_NOTES: Record<string, string> = {
  done: "Your setup is saved. Change anything in Goals, Memory and Settings.",
};

export default async function YouPage({
  searchParams,
}: {
  searchParams?: Promise<{ setup?: string | string[] }>;
}) {
  const setup = (await searchParams)?.setup;
  const setupNote =
    typeof setup === "string" && Object.hasOwn(SETUP_NOTES, setup)
      ? SETUP_NOTES[setup]
      : null;
  const client = await createServerUserClient();
  let profile;
  try {
    profile = await new ProfileRepository(client).getCurrentProfile();
  } catch (error) {
    if (
      error instanceof ProfileAuthenticationError &&
      error.accessError?.reason === "not-owner"
    ) {
      redirect("/auth/denied");
    }
    if (error instanceof ProfileAuthenticationError) redirect("/");
    throw error;
  }
  if (!profile) redirect("/");

  return (
    <main className={homeStyles.shell} id="main-content">
      <header className={styles.header}>
        <h1>You</h1>
        <Link
          aria-label="Settings"
          className={styles.settings}
          href="/home/you/settings"
        >
          <Gear />
        </Link>
      </header>
      {setupNote === null ? null : (
        <p className={styles.kept} role="status">
          {setupNote}
        </p>
      )}
      <ul className={styles.places}>
        {PLACES.map(({ href, name }) => (
          <li key={href}>
            <Link className={styles.place} href={href}>
              <strong>{name}</strong>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.signOut}>
        <SignOutButton />
      </div>
    </main>
  );
}

/**
 * Names only (owner, 2 Oct 2026). Each row had a line under it saying what
 * the place is for; each page says that itself.
 */
const PLACES = [
  { href: "/home/you/goals", name: "Goals" },
  { href: "/home/you/memory", name: "Memory" },
  { href: "/home/you/onboarding", name: "Guided setup" },
] as const;

/** The only way into Settings, so it is a full touch target with a name. */
function Gear() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
