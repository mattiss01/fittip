import "server-only";

import type { LibraryActivityOption } from "@/components/training/activity-editor";
import { PersonalActivityPersistenceError } from "@/server/personal-activities/personal-activities";
import { createPersonalActivityLibrary } from "@/server/repositories/personal-activity-repository";

/**
 * The owner's active definitions, as every session editor's picker offers
 * them. Only the values a pick copies cross to the client.
 *
 * A library that cannot be read leaves the picker out rather than taking the
 * Plan or the saved sessions down with it: both work without it, and neither
 * page claims the library is empty — the button is simply absent. An
 * authentication failure is not swallowed, because the page's own redirect
 * is the honest answer to that.
 */
export async function readLibraryOptions(): Promise<LibraryActivityOption[]> {
  let activities;
  try {
    activities = await (await createPersonalActivityLibrary()).list();
  } catch (error) {
    if (error instanceof PersonalActivityPersistenceError) return [];
    throw error;
  }
  return activities.map((activity) => ({
    id: activity.id,
    updatedAt: activity.updatedAt,
    name: activity.name,
    sport: activity.sport,
    instructions: activity.instructions ?? null,
    measurementMode: activity.measurementMode,
    target: activity.target ?? null,
  }));
}
