/**
 * A sport's colour (owner, 6 Nov 2026). Each of the owner's sports wears one
 * of twelve swatches, chosen by them in Settings and kept on the sport itself,
 * so the same sport is the same colour on Plan, Progress and anywhere else it
 * is drawn. A new sport takes the swatch fewest of their sports wear; the
 * database picks it (`sports_before_insert`).
 *
 * A row stores the swatch's key, never a colour: the colours are the
 * `--sport-N` tokens in `globals.css`, and can be retuned there.
 *
 * A record may name a sport that is not on the list: one the owner deleted,
 * or a coach's that was never accepted. It is drawn in the muted ink, so it
 * reads as no colour rather than as someone else's.
 */
export const SPORT_SWATCHES = [
  "sport-1",
  "sport-2",
  "sport-3",
  "sport-4",
  "sport-5",
  "sport-6",
  "sport-7",
  "sport-8",
  "sport-9",
  "sport-10",
  "sport-11",
  "sport-12",
] as const;

export type SportSwatch = (typeof SPORT_SWATCHES)[number];

/** What a screen reader says for each swatch, and the tooltip. */
export const SWATCH_NAMES = {
  "sport-1": "Pine",
  "sport-2": "Ember",
  "sport-3": "Ochre",
  "sport-4": "Blue",
  "sport-5": "Plum",
  "sport-6": "Teal",
  "sport-7": "Raspberry",
  "sport-8": "Olive",
  "sport-9": "Chestnut",
  "sport-10": "Sky",
  "sport-11": "Rose",
  "sport-12": "Indigo",
} as const satisfies Record<SportSwatch, string>;

/** One of the owner's sports, as their list holds it. */
export type OwnedSport = { id: string; name: string; colour: SportSwatch };

export const UNLISTED_SPORT_COLOUR = "var(--moss)";

export function isSportSwatch(value: unknown): value is SportSwatch {
  return SPORT_SWATCHES.some((swatch) => swatch === value);
}

export function swatchColour(swatch: SportSwatch): string {
  return `var(--${swatch})`;
}

/**
 * How a record's sport is matched to the list: as a person reads it, ignoring
 * case, surrounding space and a run of spaces inside. The database matches
 * the same way (`tidy_sport_name`).
 */
export function sportKey(sport: string): string {
  return sport.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

/** The colour a sport is drawn in, given the owner's list. */
export function colourOfSport(
  sports: readonly OwnedSport[],
  sport: string | null,
): string {
  if (sport === null) return UNLISTED_SPORT_COLOUR;
  const key = sportKey(sport);
  const owned = sports.find((entry) => sportKey(entry.name) === key);
  return owned ? swatchColour(owned.colour) : UNLISTED_SPORT_COLOUR;
}
