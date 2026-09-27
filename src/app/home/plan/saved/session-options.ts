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
export async function readSavedSessionOptions(): Promise<SavedSessionOption[]> {
  let sessions;
  try {
    sessions = await (await createSavedSessionLibrary()).list();
  } catch (error) {
    if (error instanceof SavedSessionPersistenceError) return [];
    throw error;
  }
  return sessions.map((session) => ({
    id: session.id,
    name: session.name,
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
