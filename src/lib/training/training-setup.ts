/**
 * The training setup guided setup asks for after goals (owner, 5 and 6 Oct
 * 2026): how often the owner wants to train, which days are out, where they
 * can train and what they have at home. All four are settings of the profile,
 * changed on Settings, and never memory items.
 *
 * The place and equipment names are only shortcuts for typing, as the sports
 * are: what is picked or added is saved as a plain name, so taking a name off
 * a list here changes nothing anyone has saved.
 */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
} as const satisfies Record<Weekday, string>;

export const SESSIONS_PER_WEEK_RANGE = { min: 1, max: 14 } as const;
export const AVAILABILITY_NOTE_MAX_LENGTH = 300;
export const TRAINING_NAME_MAX_LENGTH = 60;
export const TRAINING_PLACES_MAX_COUNT = 20;
export const HOME_EQUIPMENT_MAX_COUNT = 40;

/** The place that decides whether setup asks what there is at home. */
export const HOME_PLACE = "Home";

export const TRAINING_PLACE_PRESETS = [
  "Gym",
  HOME_PLACE,
  "Outdoors",
  "Pool",
  "Track",
  "Climbing gym",
  "Studio or classes",
  "Sports club or pitch",
] as const;

/**
 * Without bikes, skis and the like: the owner's sports already say those
 * (owner, 6 Oct 2026).
 */
export const HOME_EQUIPMENT_PRESET_GROUPS = [
  {
    label: "Weights",
    items: [
      "Dumbbells",
      "Barbell and plates",
      "Kettlebell",
      "Weight bench",
      "Squat rack",
    ],
  },
  {
    label: "Bodyweight",
    items: [
      "Pull-up bar",
      "Resistance bands",
      "Rings or TRX",
      "Mat",
      "Foam roller",
      "Skipping rope",
    ],
  },
  {
    label: "Cardio machines",
    items: [
      "Treadmill",
      "Indoor bike or trainer",
      "Rowing machine",
      "Cross trainer",
    ],
  },
] as const;

/**
 * How hard the coach pushes (owner, 12 Nov 2026; ADR-023 amended): five
 * levels in words, a slider from the first on the left to the last on the
 * right. The key is what the profile stores and the coach is sent; each
 * selects its own paragraph of instructions, never just a number.
 */
export const COACH_PUSH_LEVELS = [
  {
    key: "gentle",
    label: "Easy does it",
    line: "Keep me moving. No pressure.",
  },
  {
    key: "steady",
    label: "Steady",
    line: "Small steps, mostly comfortable.",
  },
  {
    key: "balanced",
    label: "Balanced",
    line: "Easy days and hard days, steady progress.",
  },
  {
    key: "ambitious",
    label: "Ambitious",
    line: "Push me. Being tired is fine.",
  },
  {
    key: "all_in",
    label: "All in",
    line: "Make it hard to hit. Stretch me.",
  },
] as const;
export type CoachPushLevel = (typeof COACH_PUSH_LEVELS)[number]["key"];

/** What an account that never chose is coached at (owner, 12 Nov 2026). */
export const DEFAULT_COACH_PUSH_LEVEL: CoachPushLevel = "balanced";

/** A sent value as one of the five, or null when it is none: a form refuses it. */
export function toCoachPushLevel(value: unknown): CoachPushLevel | null {
  return COACH_PUSH_LEVELS.find((level) => level.key === value)?.key ?? null;
}

/**
 * A stored value as one of the five levels, with its words. A value the app
 * does not know is read as the default, never as though the owner chose it.
 */
export function coachPushLevelOrDefault(
  value: unknown,
): (typeof COACH_PUSH_LEVELS)[number] {
  return (
    COACH_PUSH_LEVELS.find((level) => level.key === value) ??
    COACH_PUSH_LEVELS.find((level) => level.key === DEFAULT_COACH_PUSH_LEVEL)!
  );
}

export type TrainingSetupView = {
  sessionsPerWeek: number | null;
  /** Days the owner cannot train; every other day is free. */
  unavailableDays: Weekday[];
  availabilityNote: string | null;
  trainingPlaces: string[];
  homeEquipment: string[];
  pushLevel: CoachPushLevel;
};

/** Whether the owner trains at home, whatever the capitals. */
export function trainsAtHome(places: readonly string[]): boolean {
  return places.some(
    (place) => place.toLocaleLowerCase() === HOME_PLACE.toLocaleLowerCase(),
  );
}
