import "server-only";

import type {
  SavedSession,
  SavedSessionActivity,
  SavedSessionDraft,
} from "./saved-sessions";

import type {
  RollingPlanSeriesInput,
  RollingPlanSession,
  RollingPlanSessionInput,
} from "@/server/rolling-plan/rolling-plan";

/** The recurrence half of a series, which the library knows nothing about. */
export type RollingPlanRecurrenceRule = Pick<
  RollingPlanSeriesInput,
  "frequency" | "intervalCount" | "weekdays" | "startDate" | "endDate"
>;

/**
 * The copy seam, in both directions and in one place.
 *
 * Save and reuse are copies by value. Nothing links a planned session to the
 * library entry it came from, or a library entry to the planned session it was
 * saved from, so what a copy carries is decided here rather than by a foreign
 * key. These two functions are the whole contract: everything they drop is a
 * fact about a date, a Plan position, or a Plan lifecycle, and everything they
 * keep is reusable on any date.
 */

/** Save: a planned session becomes a library draft under an owner-given name. */
export function toSavedSessionDraft(
  name: string,
  session: RollingPlanSession,
): SavedSessionDraft {
  return {
    name,
    title: session.title,
    sport: session.sport,
    ...(session.intent === undefined ? {} : { intent: session.intent }),
    ...(session.expectedDurationMinutes === undefined
      ? {}
      : { expectedDurationMinutes: session.expectedDurationMinutes }),
    ...(session.note === undefined ? {} : { note: session.note }),
    // `id`, `localDate`, `position`, `isLocked`, `status` and `cancelledAt`
    // all belong to the planned session and stop here. So does each activity's
    // own identity and lock.
    activities: session.activities.map(
      ({ id, isLocked, ...activity }): SavedSessionActivity => {
        void id;
        void isLocked;
        return activity;
      },
    ),
  };
}

/**
 * Reuse: a library entry becomes a plain `add` for the Plan's own change set.
 * The new session starts unlocked and carries no history, and the entry it was
 * copied from is not referenced again.
 */
export function toRollingPlanSessionInput(
  saved: SavedSession,
  localDate: string,
  position: number,
): RollingPlanSessionInput {
  return {
    title: saved.title,
    sport: saved.sport,
    ...(saved.intent === undefined ? {} : { intent: saved.intent }),
    ...(saved.expectedDurationMinutes === undefined
      ? {}
      : { expectedDurationMinutes: saved.expectedDurationMinutes }),
    ...(saved.note === undefined ? {} : { note: saved.note }),
    localDate,
    position,
    isLocked: false,
    // The owner's name for the library entry is how they find it again. It is
    // not part of the planned session, which carries its own title.
    activities: saved.activities.map((activity) => ({
      ...activity,
      isLocked: false,
    })),
  };
}

/**
 * Reuse, the recurring way: a library entry plus a recurrence rule becomes the
 * template of a series. It is the same copy as `toRollingPlanSessionInput` and
 * deliberately the same function family rather than a second copy path - what
 * a saved session carries is decided in this file and nowhere else.
 *
 * The series template drops one more thing than a planned session does: a date
 * and a position belong to an occurrence, and the rule supplies both. Nothing
 * links the series back to the entry it was built from, so editing or deleting
 * that entry afterwards cannot reach the series or any occurrence of it.
 */
export function toRollingPlanSeriesInput(
  saved: SavedSession,
  rule: RollingPlanRecurrenceRule,
): RollingPlanSeriesInput {
  return {
    ...rule,
    title: saved.title,
    sport: saved.sport,
    ...(saved.intent === undefined ? {} : { intent: saved.intent }),
    ...(saved.expectedDurationMinutes === undefined
      ? {}
      : { expectedDurationMinutes: saved.expectedDurationMinutes }),
    ...(saved.note === undefined ? {} : { note: saved.note }),
    // A template activity carries no Plan lock, exactly as the library entry
    // does not. An occurrence enters the Plan unlocked.
    activities: saved.activities.map((activity) => ({ ...activity })),
  };
}
