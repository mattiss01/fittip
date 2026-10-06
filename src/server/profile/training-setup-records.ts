import {
  SETUP_NOTE_MAX_LENGTH,
  SETUP_NOTE_PROMPTS,
  SETUP_NOTES_MAX_COUNT,
  SETUP_STEP_COUNT,
} from "@/lib/setup/setup-steps";
import {
  AVAILABILITY_NOTE_MAX_LENGTH,
  HOME_EQUIPMENT_MAX_COUNT,
  SESSIONS_PER_WEEK_RANGE,
  TRAINING_NAME_MAX_LENGTH,
  TRAINING_PLACES_MAX_COUNT,
  WEEKDAYS,
  type TrainingSetupView,
  type Weekday,
} from "@/lib/training/training-setup";
import { ProfileDetailsValidationError } from "@/server/profile/profile-records";

/** The four questions of the training setup, each saved on its own screen. */
export const TRAINING_SETUP_PARTS = [
  "frequency",
  "days",
  "places",
  "equipment",
] as const;
export type TrainingSetupPart = (typeof TRAINING_SETUP_PARTS)[number];

/**
 * The parts of the training setup a form sends, named by its `part` fields:
 * one in guided setup, all four on Settings. A part that is not named is not
 * touched, so one screen never clears another's answer.
 */
export function parseTrainingSetup(
  formData: FormData,
): Partial<TrainingSetupView> {
  const parts = formData.getAll("part");
  if (
    parts.length < 1 ||
    !parts.every((part): part is TrainingSetupPart =>
      TRAINING_SETUP_PARTS.some((known) => known === part),
    )
  ) {
    throw new ProfileDetailsValidationError();
  }

  const change: Partial<TrainingSetupView> = {};
  if (parts.includes("frequency")) {
    change.sessionsPerWeek = sessionsPerWeek(formData);
  }
  if (parts.includes("days")) {
    change.unavailableDays = unavailableDays(formData);
    change.availabilityNote = availabilityNote(formData);
  }
  if (parts.includes("places")) {
    change.trainingPlaces = names(
      formData,
      "trainingPlaces",
      TRAINING_PLACES_MAX_COUNT,
    );
  }
  if (parts.includes("equipment")) {
    change.homeEquipment = names(
      formData,
      "homeEquipment",
      HOME_EQUIPMENT_MAX_COUNT,
    );
  }
  return change;
}

function sessionsPerWeek(formData: FormData): number | null {
  const value = text(formData, "sessionsPerWeek").trim();
  if (value === "") return null;
  const parsed = Number(value);
  if (
    !/^\d{1,2}$/.test(value) ||
    parsed < SESSIONS_PER_WEEK_RANGE.min ||
    parsed > SESSIONS_PER_WEEK_RANGE.max
  ) {
    throw new ProfileDetailsValidationError();
  }
  return parsed;
}

/** In the week's own order, each day once, whatever order they were sent in. */
function unavailableDays(formData: FormData): Weekday[] {
  const sent = formData.getAll("unavailableDays");
  if (!sent.every((day) => WEEKDAYS.some((known) => known === day))) {
    throw new ProfileDetailsValidationError();
  }
  return WEEKDAYS.filter((day) => sent.includes(day));
}

function availabilityNote(formData: FormData): string | null {
  const note = text(formData, "availabilityNote").trim();
  if (note.length > AVAILABILITY_NOTE_MAX_LENGTH) {
    throw new ProfileDetailsValidationError();
  }
  return note === "" ? null : note;
}

/**
 * Places or equipment, ticked or added, in the order sent. A name given twice
 * is kept once, as with the sports.
 */
function names(formData: FormData, key: string, maxCount: number): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const value of formData.getAll(key)) {
    if (typeof value !== "string") throw new ProfileDetailsValidationError();
    const name = value.trim().replace(/\s+/g, " ");
    if (name === "") continue;
    if (name.length > TRAINING_NAME_MAX_LENGTH) {
      throw new ProfileDetailsValidationError();
    }
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  if (kept.length > maxCount) throw new ProfileDetailsValidationError();
  return kept;
}

/** A screen of setup by its number, as the profile stores it. */
export function parseSetupStepNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > SETUP_STEP_COUNT) {
    throw new ProfileDetailsValidationError();
  }
  return parsed;
}

export type SetupNoteInput = {
  memoryType: (typeof SETUP_NOTE_PROMPTS)[number]["memoryType"];
  /** What is filed in Memory: the prompt it was written under, then the text. */
  content: string;
};

/**
 * What the owner wrote on setup's last screen: `noteKind` and `noteText`
 * fields in pairs. A field left empty is passed over, since a prompt tapped
 * and not answered is not an answer.
 */
export function parseSetupNotes(formData: FormData): SetupNoteInput[] {
  const kinds = formData.getAll("noteKind");
  const texts = formData.getAll("noteText");
  if (kinds.length !== texts.length) throw new ProfileDetailsValidationError();

  const notes: SetupNoteInput[] = [];
  const seen = new Set<string>();
  texts.forEach((value, index) => {
    if (typeof value !== "string") throw new ProfileDetailsValidationError();
    // As written, line breaks included; only runs of spaces are tidied.
    const written = value
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim();
    if (written === "") return;
    const prompt = SETUP_NOTE_PROMPTS.find(
      (known) => known.key === kinds[index],
    );
    if (!prompt || written.length > SETUP_NOTE_MAX_LENGTH) {
      throw new ProfileDetailsValidationError();
    }
    const content = `${prompt.label}: ${written}`;
    if (seen.has(content)) return;
    seen.add(content);
    notes.push({ memoryType: prompt.memoryType, content });
  });
  if (notes.length > SETUP_NOTES_MAX_COUNT) {
    throw new ProfileDetailsValidationError();
  }
  return notes;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (value === null) return "";
  if (typeof value !== "string") throw new ProfileDetailsValidationError();
  return value;
}
