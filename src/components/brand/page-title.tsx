import type { ReactNode } from "react";

import { Logo } from "./logo";
import styles from "./page-title.module.css";

/**
 * A main page's heading (owner, 15 Nov 2026): the wordmark at the side, the
 * page's name in the middle, and whatever the page keeps at its other end
 * (Plan with Coach, the Settings gear). The heading keeps the styles its
 * page gives an `h1`.
 */
export function PageTitle({
  children,
  end,
}: {
  children: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <Logo size="mini" />
      <h1 className={styles.title}>{children}</h1>
      <div className={styles.end}>{end}</div>
    </div>
  );
}
