/**
 * The form in which two activity names are compared: case-folded, outer
 * whitespace trimmed, inner runs collapsed to one space.
 *
 * It follows `personal_activities_active_name_key` for ordinary text. The two
 * can disagree on exotic Unicode — JavaScript's `\s` and `toLowerCase` are not
 * Postgres's `\s` and collation-aware `lower` for every non-breaking space or
 * dotted capital — and that is accepted: the database holds the rule and this
 * only lets the editor say a name is taken before a save is tried. A
 * disagreement shows a wrong hint or lets the database refuse with a clean
 * "already in your library"; it never admits a twin. Kept free of server
 * imports because the editor is a Client Component.
 */
export function activityNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}
