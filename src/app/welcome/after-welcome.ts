import "server-only";

import { createProfileRepository } from "@/server/repositories/profile-repository";

/**
 * Where the step before the app leads: where sign-in would have gone had it
 * not come first. Guided setup while it is waiting, otherwise Today. A new
 * friend's first sign-in meets this step before setup, and must not skip
 * setup by passing it. Failing to read the state never costs the step;
 * setup stays reachable from You.
 */
export async function afterWelcome(): Promise<string> {
  try {
    const setup = await (await createProfileRepository()).getSetupState();
    if (!setup.finished && setup.step !== null) {
      return setup.skipped
        ? "/home/you/onboarding?remind=1"
        : "/home/you/onboarding";
    }
  } catch {
    // Setup is optional and reached from You.
  }
  return "/home/today";
}
