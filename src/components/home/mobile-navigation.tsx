"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "@/app/home/home.module.css";

const DESTINATIONS = [
  { href: "/home/today", label: "Today", mark: "01" },
  { href: "/home/plan", label: "Plan", mark: "02" },
  { href: "/home/progress", label: "Progress", mark: "03" },
  { href: "/home/you", label: "You", mark: "04" },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.navigation} aria-label="Primary">
      <ul>
        {DESTINATIONS.map(({ href, label, mark }) => {
          const current =
            pathname === href ||
            (href === "/home/plan" && pathname.startsWith("/home/plan/")) ||
            (href === "/home/progress" &&
              pathname.startsWith("/home/progress/"));
          return (
            <li key={href}>
              <Link aria-current={current ? "page" : undefined} href={href}>
                <span aria-hidden="true">{mark}</span>
                <strong>{label}</strong>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
