/**
 * A colour for each of the owner's sports, given out in the order they are
 * used: the most-logged sport takes the first (owner, 5 Nov 2026). Sports are
 * free text, so nothing fixes a colour to a name; a sport that overtakes
 * another in use takes its colour, which the owner accepted for a palette that
 * always starts with the sport they do most.
 *
 * Past the palette's end a sport is drawn in the muted ink rather than a
 * repeated colour, so two sports never look like one.
 */
export const SPORT_PALETTE = [
  "var(--sport-1)",
  "var(--sport-2)",
  "var(--sport-3)",
  "var(--sport-4)",
  "var(--sport-5)",
  "var(--sport-6)",
  "var(--sport-7)",
  "var(--sport-8)",
] as const;

export const SPORT_BEYOND_PALETTE = "var(--moss)";

export type SportColour = { sport: string; colour: string };

/** `sports` most-logged first, as `CompletionLog.sportUse` returns them. */
export function sportColours(sports: string[]): SportColour[] {
  return sports.map((sport, index) => ({
    sport,
    colour: SPORT_PALETTE[index] ?? SPORT_BEYOND_PALETTE,
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
    SPORT_BEYOND_PALETTE
  );
}
