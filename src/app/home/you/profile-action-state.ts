export type ProfileActionState = {
  status: "idle" | "saved" | "validation" | "session" | "error";
  message: string;
  submission: number;
};

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
