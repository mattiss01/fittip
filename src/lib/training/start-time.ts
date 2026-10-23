/**
 * Start times (owner, 22 Oct 2026). A planned session, a series and a log
 * may carry one; none is ever required. A time is whole minutes on a 24-hour
 * clock, written `HH:MM` — the shape `<input type="time">` gives and the
 * database checks.
 */

const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isStartTime(value: unknown): value is string {
  return typeof value === "string" && START_TIME.test(value);
}

/**
 * The order of one day's sessions: timed ones first, earliest first, then the
 * untimed in the order the owner gave them (owner, 22 Oct 2026). Position
 * breaks a tie between two at the same time.
 */
export function byStartTime<
  T extends { startTime?: string | null; position: number },
>(left: T, right: T): number {
  const a = left.startTime ?? null;
  const b = right.startTime ?? null;
  if (a !== b) {
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : 1;
  }
  return left.position - right.position;
}
