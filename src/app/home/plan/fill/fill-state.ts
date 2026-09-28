import type { ActivityValue } from "@/lib/training/activity-value";

/**
 * What Fill with coach answers the session editor. A module of types only, so
 * the client component and the `"use server"` actions can both import it.
 */
export type FillProposal = {
  proposalId: string;
  /** Written by the built-in example coach rather than a live one. */
  isExample: boolean;
  summary: string;
  safetyConsiderations: string[];
  /** In the coach's order, ready to load into the editor as they are. */
  activities: ActivityValue[];
  /** One line per activity, in the same order: why the coach chose it. */
  rationales: string[];
};

export type FillResult =
  | { status: "proposal"; proposal: FillProposal }
  /**
   * The same request is still being answered elsewhere. Asking again with the
   * same key replays it rather than paying twice.
   */
  | { status: "pending"; message: string }
  | { status: "refused"; message: string };

export type DismissResult = {
  status: "dismissed" | "refused";
  message: string;
};
