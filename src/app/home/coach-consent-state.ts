/** What deciding about the coach answers, for the dialog and Settings. */
export type CoachConsentActionState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};

export const INITIAL_COACH_CONSENT_STATE: CoachConsentActionState = {
  status: "idle",
  message: null,
};
