/** As many as fit under a field at 390px without pushing the form away. */
export const SPORT_SUGGESTIONS_MAX = 6;

/**
 * The owner's sports that what was typed could be the start of (owner, 8 Oct
 * 2026): nothing for an empty field, so a long list is never in the way, and
 * from the first letter the sports with a word that begins that way. "run"
 * finds "Running" and "Trail running". A sport typed out in full is not
 * offered back, however it was capitalised.
 */
export function suggestSports(
  sports: readonly string[],
  typed: string,
  taken: readonly string[] = [],
): string[] {
  const start = typed.trim().toLocaleLowerCase();
  if (start === "") return [];
  const skipped = new Set(taken.map((sport) => sport.toLocaleLowerCase()));
  return sports
    .filter((sport) => {
      const name = sport.toLocaleLowerCase();
      if (name === start || skipped.has(name)) return false;
      return (
        name.startsWith(start) ||
        name.split(/[\s-]+/).some((word) => word.startsWith(start))
      );
    })
    .slice(0, SPORT_SUGGESTIONS_MAX);
}
