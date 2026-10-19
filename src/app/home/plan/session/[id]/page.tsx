import { SessionRoute, type SessionRouteProps } from "./session-route";

export const dynamic = "force-dynamic";

/**
 * One planned session on its own page (owner, 29 Sep 2026). The Plan and
 * Today list sessions; this is where one is read in full and changed. What it
 * reads, and how, is in `session-route.tsx`, which its edit page shares.
 */
export default function PlanSessionPage(props: SessionRouteProps) {
  return <SessionRoute {...props} />;
}
