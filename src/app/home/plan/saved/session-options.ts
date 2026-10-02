import "server-only";

import type { SavedSessionOption } from "@/components/training/saved-session-picker";
import { toActivityValue } from "@/lib/training/activity-value";
import { createSavedSessionLibrary } from "@/server/repositories/saved-session-repository";
import { SavedSessionPersistenceError } from "@/server/saved-sessions/saved-sessions";

/**
 * The owner's saved sessions, as "Use session from library" offers them on
 * the Plan's Create session and on an unplanned log. Like the activity
 * library, one that cannot be read leaves the button out rather than taking
 * the page down with it: both work without it. An authentication failure is
 * not swallowed, because the page's own redirect is the honest answer.
 */
/**
 * The library reads its entries in the order of a name nobody sees any more
 * (2 Oct 2026). An entry saved before then may carry a name that differs from
 * its title, so every list the owner sees is put in the order of what it
 * shows.
 */
export function byTitle<Entry extends { title: string; id: string }>(
  entries: readonly Entry[],
): Entry[] {
  return entries.toSorted(
    (left, right) =>
      left.title.localeCompare(right.title, "en", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
  );
}

export async function readSavedSessionOptions(): Promise<SavedSessionOption[]> {
  let sessions;
  try {
    sessions = await (await createSavedSessionLibrary()).list();
  } catch (error) {
    if (error instanceof SavedSessionPersistenceError) return [];
    throw error;
  }
  return byTitle(sessions).map((session) => ({
    id: session.id,
    title: session.title,
    sport: session.sport,
    expectedDurationMinutes: session.expectedDurationMinutes ?? null,
    intent: session.intent ?? null,
    note: session.note ?? null,
    activities: session.activities
      .toSorted((left, right) => left.position - right.position)
      .map(toActivityValue),
  }));
}
