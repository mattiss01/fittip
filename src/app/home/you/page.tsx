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

export default async function YouPage() {
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
      </header>
      <ul className={styles.places}>
        {PLACES.map(({ href, name, line }) => (
          <li key={href}>
            <Link className={styles.place} href={href}>
              <div>
                <strong>{name}</strong>
                <span>{line}</span>
              </div>
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
 * The one line under each name is the explanation that survives R3: what the
 * place is for, and for Memory that it holds only what the coach is allowed to
 * use. Everything longer is said on the page it describes.
 */
const PLACES = [
  {
    href: "/home/you/goals",
    name: "Goals",
    line: "What your training is aimed at",
  },
  {
    href: "/home/you/memory",
    name: "Memory",
    line: "What the coach may use about you",
  },
  {
    href: "/home/you/onboarding",
    name: "Guided setup",
    line: "Set up goals and memory step by step",
  },
] as const;

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
