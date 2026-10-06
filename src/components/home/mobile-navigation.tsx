"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "@/app/home/home.module.css";
import {
  PlanIcon,
  ProgressIcon,
  TodayIcon,
  YouIcon,
} from "@/components/home/navigation-icons";

const DESTINATIONS = [
  { href: "/home/today", label: "Today", Icon: TodayIcon },
  { href: "/home/plan", label: "Plan", Icon: PlanIcon },
  { href: "/home/progress", label: "Progress", Icon: ProgressIcon },
  { href: "/home/you", label: "You", Icon: YouIcon },
] as const;

export function MobileNavigation({
  setupOpen = false,
}: {
  /** Guided setup is not finished: "You", where it is reached, is marked. */
  setupOpen?: boolean;
}) {
  const pathname = usePathname();

  // Guided setup is walked from its first step to its last without the app's
  // navigation under it (owner, 5 Oct 2026). "Continue later" and the back
  // link are its ways out.
  if (pathname === "/home/you/onboarding") return null;

  return (
    <nav className={styles.navigation} aria-label="Primary">
      <ul>
        {DESTINATIONS.map(({ href, label, Icon }) => {
          // A page under a destination keeps that destination current.
          const current = pathname === href || pathname.startsWith(`${href}/`);
          // Said as well as shown, but as a description: the link is still
          // named "You", which is what it is looked for by.
          const marked = setupOpen && href === "/home/you";
          return (
            <li key={href}>
              <Link
                aria-current={current ? "page" : undefined}
                aria-describedby={marked ? "setup-open-note" : undefined}
                href={href}
              >
                <span className={styles.navigationIcon}>
                  <Icon />
                  {marked ? (
                    <span
                      aria-hidden="true"
                      className={styles.navigationDot}
                      data-setup-open
                    />
                  ) : null}
                </span>
                <strong>{label}</strong>
              </Link>
              {marked ? (
                <span className="sr-only" id="setup-open-note">
                  Guided setup is not finished
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
