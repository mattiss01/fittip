import "server-only";

import type { LibraryActivityOption } from "@/components/training/activity-editor";
import { createPersonalActivityLibrary } from "@/server/repositories/personal-activity-repository";

/**
 * The owner's active definitions, as every session editor's picker offers
 * them. Only the values a pick copies cross to the client.
 */
export async function readLibraryOptions(): Promise<LibraryActivityOption[]> {
  const activities = await (await createPersonalActivityLibrary()).list();
  return activities.map((activity) => ({
    id: activity.id,
    name: activity.name,
    sport: activity.sport,
    instructions: activity.instructions ?? null,
    measurementMode: activity.measurementMode,
    target: activity.target ?? null,
  }));
}
