"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CoachConsentActionState } from "@/app/home/coach-consent-state";
import {
  ConsentAuthenticationError,
  createConsents,
} from "@/server/repositories/consent-repository";
import { afterWelcome } from "./after-welcome";

const COPY = {
  signedOut: "Sign in again to decide.",
  failed: "That could not be saved. Try again.",
  unticked: "Tick both boxes to go on.",
} as const;

/**
 * The Terms and, on its own line, the explicit health consent (owner, 15 Nov
 * 2026), both required before the app opens and recorded together. Only
 * acceptances are recorded: not using FitTip is how they are declined. Then
 * on to the app, where the coach is asked separately.
 */
export async function acceptTermsAction(
  _previous: CoachConsentActionState,
  formData: FormData,
): Promise<CoachConsentActionState> {
  if (formData.get("terms") !== "on" || formData.get("health") !== "on") {
    return { status: "error", message: COPY.unticked };
  }
  try {
    await (await createConsents()).acceptTerms();
  } catch (error) {
    if (error instanceof ConsentAuthenticationError) {
      return { status: "error", message: COPY.signedOut };
    }
    return { status: "error", message: COPY.failed };
  }
  revalidatePath("/home", "layout");
  redirect(await afterWelcome());
}
