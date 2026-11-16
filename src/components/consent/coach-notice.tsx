import Link from "next/link";

import { COACH_NOTICE_SECTIONS, COACH_NOTICE_TITLE } from "@/lib/coach-notice";
import styles from "./coach-consent.module.css";

/**
 * The notice as a person reads it, in the dialog and in Settings. The words
 * are `@/lib/coach-notice`'s; a change there is a new version, asked again.
 */
export function CoachNotice({
  headingId,
  showTitle = true,
}: {
  headingId?: string;
  showTitle?: boolean;
}) {
  return (
    <div className={styles.notice}>
      {showTitle ? (
        <h2 className={styles.title} id={headingId}>
          {COACH_NOTICE_TITLE}
        </h2>
      ) : null}
      {COACH_NOTICE_SECTIONS.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p>
        Everything else FitTip keeps is in the{" "}
        <Link href="/privacy#coach" rel="noopener noreferrer" target="_blank">
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}
