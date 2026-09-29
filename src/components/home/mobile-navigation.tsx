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

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navigation} aria-label="Primary">
      <ul>
        {DESTINATIONS.map(({ href, label, Icon }) => {
          const current =
            pathname === href ||
            (href === "/home/plan" && pathname.startsWith("/home/plan/")) ||
            (href === "/home/progress" &&
              pathname.startsWith("/home/progress/"));
          return (
            <li key={href}>
              <Link aria-current={current ? "page" : undefined} href={href}>
                <span className={styles.navigationIcon}>
                  <Icon />
                </span>
                <strong>{label}</strong>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
