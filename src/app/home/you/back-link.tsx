import Link from "next/link";

import styles from "./you.module.css";

/**
 * The way back from a page under You or under the Plan, drawn as on a
 * Progress record. The page's navigation has a link of the same name, so a
 * browser spec takes this one by `data-back-link`.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className={styles.backLink} href={href} data-back-link>
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
