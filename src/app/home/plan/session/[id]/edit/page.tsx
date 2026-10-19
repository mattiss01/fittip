import { SessionRoute, type SessionRouteProps } from "../session-route";

export const dynamic = "force-dynamic";

/**
 * A session's edit form on a page of its own (owner, 19 Oct 2026), read the
 * same way as the session and leaving for it once saved.
 */
export default function EditPlanSessionPage(props: SessionRouteProps) {
  return <SessionRoute {...props} editing />;
}
