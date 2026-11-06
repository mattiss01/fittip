import Link from "next/link";

import homeStyles from "../../home.module.css";
import { BackLink } from "../back-link";
import { Chevron } from "../chevron";
import styles from "../you.module.css";
import { readOwnProfile } from "./settings-page";

export const dynamic = "force-dynamic";

/**
 * Settings, reached from the gear on You: a list of the settings, each on a
 * page of its own (owner, 6 Nov 2026), in place of one long page that held
 * them all. Each row is the setting's name and nothing else (owner's
 * choice). What setup asks is first, then the units and the time zone; the
 * account's own rows come last, changing the password (ADR-042) and
 * deleting the account, in red (owner, 23 Oct 2026; ADR-039). Sign out
 * stays on You (owner, 2 Oct 2026).
 */
const SETTINGS = [
  { href: "/home/you/settings/about", name: "About you" },
  { href: "/home/you/settings/weight", name: "Weight history" },
  { href: "/home/you/settings/sports", name: "Your sports" },
  { href: "/home/you/settings/training", name: "Training setup" },
  { href: "/home/you/settings/units", name: "Units and time zone" },
] as const;

/** What a changed password comes back with; nothing else is read from it. */
const PASSWORD_NOTES: Record<string, string> = {
  changed: "Password changed. Your other devices are signed out.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const { password } = await searchParams;
  const passwordNote =
    typeof password === "string" && Object.hasOwn(PASSWORD_NOTES, password)
      ? PASSWORD_NOTES[password]
      : null;
  // Signed out or without a profile, there is nothing to set.
  await readOwnProfile((profiles) => profiles.getCurrentProfile());

  return (
    <main className={homeStyles.shell} id="main-content">
      <BackLink href="/home/you" label="You" />
      <header className={styles.header}>
        <h1>Settings</h1>
      </header>
      {passwordNote === null ? null : (
        <p className={styles.kept} role="status">
          {passwordNote}
        </p>
      )}
      <ul className={styles.places} aria-label="Settings">
        {SETTINGS.map(({ href, name }) => (
          <li key={href}>
            <Link className={styles.place} href={href}>
              <strong>{name}</strong>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      <ul className={styles.places} aria-label="Account">
        <li>
          <Link className={styles.place} href="/home/you/settings/password">
            <strong>Change password</strong>
            <Chevron />
          </Link>
        </li>
        <li>
          <Link
            className={styles.place}
            data-danger
            href="/home/you/settings/delete"
          >
            <strong>Delete account</strong>
            <Chevron />
          </Link>
        </li>
      </ul>
    </main>
  );
}
