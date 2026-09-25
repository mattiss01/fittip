import styles from "./activity-list.module.css";

/** One activity, already reduced to the words a card prints. */
export type ActivityListItem = {
  key: string;
  name: string;
  /** A target or an actual, in words; null when there is nothing to say. */
  detail: string | null;
};

/**
 * A session's activities, read rather than edited: the plan's targets on a
 * card nobody has logged yet, and what was actually done on one that has.
 * Which of the two it is, the caller's label says; this draws either alike,
 * because `describeMeasurement` already words a target and an actual the same
 * way.
 *
 * Server-renderable on purpose. Today and the Plan day draw it inside cards
 * that are not interactive, so it adds nothing to the client bundle.
 */
export function ActivityList({
  label,
  items,
}: {
  label: string;
  items: ActivityListItem[];
}) {
  if (items.length === 0) return null;
  return (
    <div className={styles.list} data-activity-list>
      <p className={styles.label}>{label}</p>
      <ol className={styles.items}>
        {items.map((item) => (
          <li className={styles.item} key={item.key}>
            <span className={styles.name}>{item.name}</span>
            {item.detail === null ? null : (
              <span className={styles.detail}>{item.detail}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
