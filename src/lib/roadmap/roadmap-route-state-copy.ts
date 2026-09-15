/**
 * The roadmap route's boundary-state copy, in the one module a Client
 * Component may import.
 *
 * `error.tsx` must be a Client Component, and `ROADMAP_COPY` lives in
 * `@/server/roadmap/roadmap-records`, which imports `server-only` and sits
 * under `@/server/**` — both of which the client import boundary refuses. So
 * these strings live here, with no import of their own, and `ROADMAP_COPY`
 * spreads them in: every roadmap wording is still reachable from that one
 * constant, and none is written in a component.
 *
 * New user-visible strings from M3-15E, and the product owner's to confirm.
 */
export const ROADMAP_ROUTE_STATE_COPY = {
  stateKicker: "Roadmap",
  errorTitle: "Your roadmap could not be read.",
  errorBody:
    "Nothing was lost and nothing was changed. This surface only reads, so it is safe to try again.",
  errorRetry: "Retry",
  loadingTitle: "Loading your roadmap.",
  loadingBody: "Nothing is proposed or changed while this loads.",
} as const;
