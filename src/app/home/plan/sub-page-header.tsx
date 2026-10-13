import type { ReactNode } from "react";

import styles from "./sub-page-header.module.css";

import { BackLink } from "../you/back-link";

/**
 * The top of a page under the Plan, in the Coach's note direction (R3): the
 * way back, the name the Plan's own chip gives the page, and at most one line.
 * The line is the explanation that survives the old intro, so it is kept only
 * where leaving it out would let the page be misread.
 */
export function SubPageHeader({
  title,
  line,
  aside,
  action,
}: {
  title: string;
  line?: string;
  /** A short fact beside the title: a count, a version. */
  aside?: ReactNode;
  /**
   * The page's one control, in the top right corner on the row of the way
   * back (owner, 13 Oct 2026).
   */
  action?: ReactNode;
}) {
  return (
    <>
      {action === undefined ? (
        <BackLink href="/home/plan" label="Plan" />
      ) : (
        <div className={styles.top}>
          <BackLink href="/home/plan" label="Plan" />
          {action}
        </div>
      )}
      <header className={styles.header}>
        <h1>{title}</h1>
        {aside === undefined ? null : <p className={styles.aside}>{aside}</p>}
      </header>
      {line === undefined ? null : <p className={styles.line}>{line}</p>}
    </>
  );
}
