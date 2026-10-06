export type SetupActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  /**
   * After the goals screen is saved: the id each row has now, in the rows'
   * own order, so that a row saved once is edited the next time and not
   * created again. Null for a row left empty.
   */
  goalIds?: (string | null)[];
};

export const INITIAL_SETUP_ACTION_STATE: SetupActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
