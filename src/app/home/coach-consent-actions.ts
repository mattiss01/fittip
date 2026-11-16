"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { COACH_CONSENT_LATER_COOKIE } from "@/lib/coach-consent-cookie";
import {
  ConsentAuthenticationError,
  createConsents,
} from "@/server/repositories/consent-repository";
import type { CoachConsentActionState } from "./coach-consent-state";

const COPY = {
  signedOut: "Sign in again to decide.",
  failed: "That could not be saved. Try again.",
  termsFirst: "Accept the Terms first.",
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
    const consents = await createConsents();
    // The coach is asked after the step before the app, never instead of it.
    if (!(await consents.termsAccepted())) {
      return { status: "error", message: COPY.termsFirst };
    }
    await consents.record("coach", decision);
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
