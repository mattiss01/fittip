/**
 * The form in which two activity names are compared: case-folded, outer
 * whitespace trimmed, inner runs collapsed to one space.
 *
 * It mirrors `personal_activities_active_name_key` exactly. The database holds
 * the rule and this only explains it — the editor uses it to say a name is
 * taken before a save is tried, and the server to name the clash — so a drift
 * would show a stale hint, never admit a twin. Kept free of server imports
 * because the editor is a Client Component.
 */
export function activityNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}
