"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { COACH_CONSENT_LATER_COOKIE } from "@/lib/coach-consent-cookie";
import {
  ConsentAuthenticationError,
  createConsents,
} from "@/server/repositories/consent-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import type { CoachConsentActionState } from "./coach-consent-state";

const COPY = {
  signedOut: "Sign in again to decide.",
  failed: "That could not be saved. Try again.",
  unticked: "Tick both boxes to go on.",
} as const;

/**
 * Agree or decline the coach, from the dialog after sign-in or from Settings ›
 * Coach and your data (ADR-043 decision 5). Each is a new row; withdrawing is
 * a decline. The decision is read from the form's own button, never trusted
 * beyond the two values the repository accepts.
 */
export async function decideCoachConsentAction(
  _previous: CoachConsentActionState,
  formData: FormData,
): Promise<CoachConsentActionState> {
  const decision = formData.get("decision");
  if (decision !== "agreed" && decision !== "declined") {
    return { status: "error", message: COPY.failed };
  }
  try {
    await (await createConsents()).record("coach", decision);
  } catch (error) {
    if (error instanceof ConsentAuthenticationError) {
      return { status: "error", message: COPY.signedOut };
    }
    return { status: "error", message: COPY.failed };
  }
  revalidatePath("/home", "layout");
  return { status: "saved", message: null };
}

/**
 * The ✕ on the coach dialog (owner, 12 Nov 2026): nothing is decided, and the
 * dialog comes back after the next sign-in, which deletes this cookie. It
 * only hides a prompt; nothing reads it to allow anything.
 */
export async function postponeCoachConsentAction(): Promise<void> {
  const store = await cookies();
  store.set(COACH_CONSENT_LATER_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/home", "layout");
}

/**
 * The Terms and, on its own line, the explicit health consent (owner, 15 Nov
 * 2026), both required before the app opens and recorded as two decisions.
 * Only acceptances are recorded: not using FitTip is how they are declined.
 * Then on to the app, where the coach is asked separately.
 */
export async function acceptTermsAction(
  _previous: CoachConsentActionState,
  formData: FormData,
): Promise<CoachConsentActionState> {
  if (formData.get("terms") !== "on" || formData.get("health") !== "on") {
    return { status: "error", message: COPY.unticked };
  }
  try {
    const consents = await createConsents();
    await consents.record("terms", "agreed");
    await consents.record("health", "agreed");
  } catch (error) {
    if (error instanceof ConsentAuthenticationError) {
      return { status: "error", message: COPY.signedOut };
    }
    return { status: "error", message: COPY.failed };
  }
  revalidatePath("/home", "layout");
  redirect(await afterWelcome());
}

/**
 * Where sign-in would have gone had this step not come first: guided setup
 * while it is waiting, otherwise Today. A new friend's first sign-in meets
 * this step before setup, and must not skip setup by passing it. Failing to
 * read the state never costs the step; setup stays reachable from You.
 */
async function afterWelcome(): Promise<string> {
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
