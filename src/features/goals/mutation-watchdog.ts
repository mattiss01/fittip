/**
 * M2-05: a goal mutation whose result never reaches the surface.
 *
 * The goal surface submits through `useActionState`, so both the typed result
 * and the revalidated server tree arrive inside one App Router transition.
 * That transition intermittently never commits: the server answers, but React
 * renders nothing further, so the page stays on "Saving goal change…" for ever
 * with stale content and no message. A user sees a surface that silently did
 * nothing.
 *
 * What these rules can observe is narrow, and the copy they drive must not
 * exceed it. A resource timing entry proves that a **response arrived**. It
 * does not prove what the response said: `changeGoalAction` answers 200 for a
 * validation failure, a stale conflict, a core-limit conflict, an
 * archive-required conflict, an expired session, and a persistence error just
 * as it does for a success. So the outcome here is only ever "a reply came
 * back and never rendered" or "nothing came back at all" — never "it saved".
 *
 * They are kept free of React so the timing decisions can be tested directly
 * rather than inferred from a component.
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

/**
 * `consumedAt` is the newest response the *previous* mutation had already seen
 * when it settled. Comparing against it, rather than against `submittedAt`,
 * is what makes a fast response safe: `submittedAt` can only be read once the
 * pending render commits, so a reply that beat that commit would look older
 * than its own submission and be missed. A response newer than everything the
 * last mutation accounted for belongs to this one, whenever it arrived.
 */
export function watchGoalMutation({
  submittedAt,
  respondedAt,
  consumedAt,
  now,
}: {
  submittedAt: number;
  respondedAt: number | null;
  consumedAt: number | null;
  now: number;
}): GoalMutationWatch {
  const unaccountedFor =
    respondedAt !== null && (consumedAt === null || respondedAt > consumedAt);
  if (unaccountedFor && now - respondedAt >= RENDER_GRACE_MS) {
    return "lost-render";
  }
  if (now - submittedAt >= CONFIRMATION_BUDGET_MS) return "unconfirmed";
  return "waiting";
}

/**
 * The App Router posts a Server Action to the current URL, so a resource entry
 * with exactly that name is this page's mutation response. Router prefetches
 * of the same route append an `_rsc` query and therefore have a different
 * entry name.
 *
 * `actionUrl` must carry the page's own query string as well as its path. The
 * goals route has none today, but a future one would post to
 * `/home/you/goals?x=1`; matching on the path alone would then also match the
 * prefetches, and matching on a query-less URL would match nothing at all and
 * silently degrade every mutation to the ten-second path.
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
