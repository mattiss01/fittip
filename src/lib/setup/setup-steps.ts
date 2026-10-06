/**
 * Guided setup's screens, in order (owner, 5 and 6 Oct 2026). Each saves
 * where its answer lives: the profile, Goals or Memory. Nothing waits in a
 * draft and nothing is reviewed at the end.
 *
 * A screen's number is what the profile stores as where setup stands, so the
 * order here is not to be changed without thinking of accounts mid-setup.
 * "What do you have at home?" is passed over unless Home is a place.
 */
export const SETUP_STEPS = [
  "name",
  "birthday",
  "gender",
  "height",
  "weight",
  "sports",
  "goals",
  "frequency",
  "days",
  "places",
  "equipment",
  "notes",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_COUNT = SETUP_STEPS.length;

/** The number of a screen, counted from one. */
export function setupStepNumber(step: SetupStep): number {
  return SETUP_STEPS.indexOf(step) + 1;
}

export type SetupStateView = {
  /** The screen setup stands on, or null when it was never begun. */
  step: number | null;
  finished: boolean;
  /** The owner chose "Continue later" at least once. */
  skipped: boolean;
};

/**
 * A goal the account already has, as setup's goals screen shows it: what
 * that screen asks, and the id that makes saving it an edit.
 */
export type SetupGoalView = {
  id: string;
  title: string;
  desiredOutcome: string;
  activityAreas: string[];
  targetDate: string | null;
  priorityTier: "core" | "supporting";
};

/**
 * What the last screen offers to write about (owner, 6 Oct 2026). A tap adds
 * a text field under that label, and any of them can be tapped again. Each
 * field becomes one memory item of the kind named here, as it was written.
 */
export const SETUP_NOTE_PROMPTS = [
  { key: "injury", label: "An old injury", memoryType: "constraint" },
  {
    key: "health",
    label: "A health condition to consider",
    memoryType: "constraint",
  },
  { key: "enjoy", label: "What I enjoy", memoryType: "preference" },
  { key: "dislike", label: "What I can't stand", memoryType: "preference" },
  {
    key: "background",
    label: "My training background",
    memoryType: "profile_fact",
  },
  { key: "why", label: "Why I'm doing this", memoryType: "profile_fact" },
  {
    key: "routine",
    label: "My job and daily routine",
    memoryType: "profile_fact",
  },
  {
    key: "other_preference",
    label: "Other preference",
    memoryType: "preference",
  },
  {
    key: "other_limitation",
    label: "Other limitation",
    memoryType: "constraint",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  // Three of Memory's kinds; "observed pattern" is never the owner's own.
  memoryType: "profile_fact" | "constraint" | "preference";
}[];
export type SetupNotePromptKey = (typeof SETUP_NOTE_PROMPTS)[number]["key"];

/**
 * The coach plans with at most twenty memory items of 5,600 bytes together
 * and refuses with more (`src/server/ai/context.ts`). Twelve fields of 300
 * characters leave room for what Memory holds besides.
 */
export const SETUP_NOTE_MAX_LENGTH = 300;
export const SETUP_NOTES_MAX_COUNT = 12;
