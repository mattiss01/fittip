import Link from "next/link";

import styles from "./you.module.css";

/** The way back from a page under You, drawn as on a Progress record. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className={styles.backLink} href={href}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {label}
    </Link>
  );
}
