export type MemoryActionDraft = {
  memoryType: string;
  content: string;
  reviewDate: string;
};

export type MemoryActionState = {
  status: "idle" | "saved" | "validation" | "conflict" | "session" | "error";
  message: string;
  submission: number;
  operation?: string;
  itemId?: string;
  /**
   * The owner's own words, returned to their own screen so a rejected save
   * does not lose them. It is never logged and never leaves this response.
   */
  draft?: MemoryActionDraft;
};

export const INITIAL_MEMORY_ACTION_STATE: MemoryActionState = {
  status: "idle",
  message: "",
  submission: 0,
};
