export type ActivityLibraryOperation = "create" | "edit" | "archive";

export type ActivityLibraryActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  /** Increments once per submission so a result can be keyed to its form. */
  submission: number;
  operation?: ActivityLibraryOperation;
  personalActivityId?: string;
};

export const INITIAL_ACTIVITY_LIBRARY_ACTION_STATE: ActivityLibraryActionState =
  {
    status: "idle",
    message: "",
    submission: 0,
  };
