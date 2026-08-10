import "server-only";

import type { CoachAI } from "@/server/ai/contracts";
import { FixtureCoachAI } from "@/server/ai/fixtures/fixture-adapter";

/**
 * Which adapters are exempt from the live enablement gate, and why the answer
 * is not `adapter.kind`.
 *
 * M3-01's independent review found that the gate ran only when
 * `adapter.kind === "provider"`. `kind` is something an adapter asserts about
 * itself, so a provider adapter copy-pasted from `FixtureCoachAI` would inherit
 * `kind: "fixture"` and call out with no runtime check, no live flag, no owner
 * allowlist, and no credential check — and nothing would catch it.
 *
 * The gate is therefore deny-by-default and keyed on identity instead: an
 * adapter is exempt only if it is one of the constructors listed here, which is
 * a fact about the module graph rather than a claim in a field. The comparison
 * is exact constructor identity rather than `instanceof`, so a subclass of a
 * listed adapter is gated too — a subclass can add a socket, and inheriting an
 * exemption is exactly the failure this replaces.
 *
 * `src/architecture/coach-ai-network-gate.test.ts` fails if a listed adapter's
 * module gains a network primitive, so adding an entry here cannot quietly
 * exempt something that can reach the network.
 */
export const NETWORK_FREE_COACH_AI_ADAPTERS = [FixtureCoachAI] as const;

export function isNetworkFreeCoachAI(adapter: CoachAI): boolean {
  return NETWORK_FREE_COACH_AI_ADAPTERS.some(
    (candidate) => adapter.constructor === candidate,
  );
}
