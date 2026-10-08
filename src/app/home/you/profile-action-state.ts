export type ProfileActionState = {
  status: "idle" | "saved" | "validation" | "session" | "error";
  message: string;
  submission: number;
  /**
   * The place in "About you" of the answer a save refused, when it was one
   * of them: setup shows one a screen and goes to that one.
   */
  question?: number;
};

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
