import Link from "next/link";

import styles from "./you.module.css";

/**
 * The way back from a page under You, the Plan or a Progress record. It
 * shows the page it goes back to and is named "Back to" it, since the page's
 * navigation may have a link of that name too: two links called "You" were
 * one too many for a screen reader, and for a spec that asked for "You".
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      aria-label={`Back to ${label}`}
      className={styles.backLink}
      href={href}
      data-back-link
    >
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
