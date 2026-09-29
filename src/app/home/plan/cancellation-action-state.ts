export type CancellationActionState = {
  status: "idle" | "saved" | "validation" | "session" | "error";
  message: string;
  submission: number;
};

export const INITIAL_CANCELLATION_ACTION_STATE: CancellationActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
