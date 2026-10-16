import styles from "./log-deleted-note.module.css";

/**
 * "Log deleted." on whichever page a delete leaves for (ADR-031): Today,
 * Progress or the Plan session the log answered, wherever it was opened from
 * (owner, 16 Oct 2026). The flag only chooses whether this fixed sentence
 * shows; nothing else is read from it.
 */
export function LogDeletedNote({
  flag,
}: {
  flag: string | string[] | undefined;
}) {
  if (flag !== "deleted") return null;
  return (
    <p className={styles.note} role="status" data-log-deleted-note>
      Log deleted.
    </p>
  );
}
