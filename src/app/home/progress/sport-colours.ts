import {
  colourOfSport,
  UNLISTED_SPORT_COLOUR,
  type OwnedSport,
} from "@/lib/sports/sport-colours";

/**
 * The sports the owner has logged, each in the colour they gave it in
 * Settings (owner, 6 Nov 2026), so a sport is the same colour here as on the
 * Plan. Until then the colours were handed out by use, most-logged first, and
 * moved whenever one sport overtook another.
 *
 * A logged sport that is not on the owner's list, one they deleted, is drawn
 * in the muted ink.
 */
export type SportColour = { sport: string; colour: string };

/** `sports` most-logged first, as `CompletionLog.sportUse` returns them. */
export function sportColours(
  sports: string[],
  owned: readonly OwnedSport[],
): SportColour[] {
  return sports.map((sport) => ({
    sport,
    colour: colourOfSport(owned, sport),
  }));
}

/**
 * A sport the owner asked for, or all of them. Only a sport the owner has
 * logged is one: anything else in the URL is a stale or mistyped link, and
 * falls back to the whole month rather than to an empty one.
 */
export function readRequestedSport(
  value: string | string[] | undefined,
  sports: string[],
): string | null {
  return typeof value === "string" && sports.includes(value) ? value : null;
}

export function colourOf(colours: SportColour[], sport: string | null) {
  return (
    colours.find((entry) => entry.sport === sport)?.colour ??
    UNLISTED_SPORT_COLOUR
  );
}
