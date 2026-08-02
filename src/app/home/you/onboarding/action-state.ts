import type { OnboardingStep } from "@/lib/onboarding/onboarding-contract";

export type OnboardingActionState = {
  status:
    | "idle"
    | "saved"
    | "published"
    | "validation"
    | "conflict"
    | "session"
    | "error";
  message: string;
  submission: number;
  nextStep?: OnboardingStep;
  redirectTo?: string;
};

export const INITIAL_ONBOARDING_ACTION_STATE: OnboardingActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
