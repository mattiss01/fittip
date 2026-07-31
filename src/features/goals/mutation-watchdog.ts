/**
 * M2-05: a confirmed goal mutation that never reaches the surface.
 *
 * The goal surface submits through `useActionState`, so both the typed result
 * and the revalidated server tree arrive inside one App Router transition.
 * That transition intermittently never commits: the mutation is applied and
 * the server responds, but React renders nothing further, so the page stays on
 * "Saving goal change…" for ever with stale content and no error. A user sees
 * a surface that silently did nothing.
 *
 * These rules turn that frozen state into an honest outcome. They are kept
 * free of React so the timing decisions can be tested directly rather than
 * inferred from a component.
 */

export type GoalMutationWatch = "waiting" | "lost-render" | "unconfirmed";

/**
 * A response that has already arrived should reach the surface far inside this
 * budget. Measured responses rendered within 150 ms; this leaves five times
 * that before the surface is declared frozen.
 */
export const RENDER_GRACE_MS = 750;

/**
 * With no response at all we do not know whether the mutation was applied, so
 * the surface reports the uncertainty instead of guessing. Deliberately far
 * above any observed mutation, which completed in well under a second.
 */
export const CONFIRMATION_BUDGET_MS = 10_000;

/** How often the surface re-examines an in-flight mutation. */
export const WATCH_INTERVAL_MS = 250;

/** How long the recovery notice stays readable before the reload. */
export const RECOVERY_NOTICE_MS = 500;

export function watchGoalMutation({
  submittedAt,
  respondedAt,
  now,
}: {
  submittedAt: number;
  respondedAt: number | null;
  now: number;
}): GoalMutationWatch {
  const responded =
    respondedAt !== null &&
    respondedAt >= submittedAt &&
    now - respondedAt >= RENDER_GRACE_MS;
  if (responded) return "lost-render";
  if (now - submittedAt >= CONFIRMATION_BUDGET_MS) return "unconfirmed";
  return "waiting";
}

/**
 * The App Router posts a Server Action to the current URL with no query, so a
 * resource entry with exactly that name is this page's mutation response.
 * Router prefetches of the same route carry an `_rsc` query and therefore a
 * different entry name.
 */
export function latestActionResponseAt(
  entries: readonly { name: string; responseEnd: number }[],
  actionUrl: string,
): number | null {
  let latest: number | null = null;
  for (const entry of entries) {
    if (entry.name !== actionUrl) continue;
    if (!(entry.responseEnd > 0)) continue;
    if (latest === null || entry.responseEnd > latest)
      latest = entry.responseEnd;
  }
  return latest;
}
