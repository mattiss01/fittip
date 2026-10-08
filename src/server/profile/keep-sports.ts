import "server-only";

import {
  SPORT_NAME_MAX_LENGTH,
  SPORTS_MAX_COUNT,
} from "@/lib/sports/sport-presets";
import { createProfileRepository } from "@/server/repositories/profile-repository";

/**
 * A sport the owner typed that is not among their sports joins them (owner,
 * 5 Oct 2026 for a goal in setup, 8 Oct 2026 wherever a sport is typed), so
 * it is offered the next time. Called once the save it came with has gone
 * through; if this cannot be done that record keeps its sport and the
 * owner's list is simply not longer, which is why nothing is thrown.
 *
 * A name with a comma or longer than a sport on the list may be is left
 * where it was typed: the list is sent with commas between its names.
 */
export async function keepSports(names: readonly unknown[]): Promise<void> {
  const typed = names
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter(
      (name) =>
        name !== "" &&
        name.length <= SPORT_NAME_MAX_LENGTH &&
        !name.includes(","),
    );
  if (typed.length === 0) return;
  try {
    const profiles = await createProfileRepository();
    const owned = (await profiles.getDetails())?.sports ?? [];
    const known = new Set(owned.map((sport) => sport.toLocaleLowerCase()));
    const added: string[] = [];
    for (const sport of typed) {
      const key = sport.toLocaleLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      added.push(sport);
    }
    // Held to the list's own limit; past it the record still keeps its sport.
    const room = Math.max(0, SPORTS_MAX_COUNT - owned.length);
    if (added.length > 0 && room > 0) {
      await profiles.saveSports([...owned, ...added.slice(0, room)]);
    }
  } catch {
    // See above: the save this came with has gone through.
  }
}

/**
 * Every sport a form names: the session's own, a replacement's, and each
 * activity's, sent as JSON by `ActivityEditor`, the log and the library. Read
 * loosely on purpose. The save has already judged the form; this only
 * collects names, and what is not a name is passed over.
 */
export function submittedSports(formData: FormData): unknown[] {
  const names: unknown[] = [
    formData.get("sport"),
    formData.get("replacement.sport"),
  ];
  for (const field of ["activity", "activities", "replacement.activities"]) {
    const raw = formData.get(field);
    if (typeof raw !== "string") continue;
    try {
      const sent: unknown = JSON.parse(raw);
      for (const activity of Array.isArray(sent) ? sent : [sent]) {
        names.push(sportOf(activity));
      }
    } catch {
      // Not activities; the save has said so if it mattered.
    }
  }
  return names;
}

/** The sport of an activity handed to an action as a value, if it has one. */
export function sportOf(activity: unknown): unknown {
  return typeof activity === "object" &&
    activity !== null &&
    "sport" in activity
    ? activity.sport
    : undefined;
}
