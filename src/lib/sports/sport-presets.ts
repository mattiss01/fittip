/**
 * The sports guided setup offers (owner, 5 Oct 2026). A sport the owner picks
 * or adds is saved to their profile as a plain name, so this list is only a
 * shortcut for typing: removing a name here takes it off the picker and
 * changes nothing anyone has saved.
 *
 * Names only. This is not an exercise library, which the product rules out:
 * activities stay personal definitions.
 */
export const SPORT_PRESET_GROUPS = [
  {
    label: "Endurance",
    sports: [
      "Running",
      "Trail running",
      "Walking",
      "Hiking",
      "Cycling",
      "Mountain biking",
      "Rowing",
      "Triathlon",
      "Inline skating",
    ],
  },
  {
    label: "Strength",
    sports: [
      "Strength training",
      "Weightlifting",
      "Powerlifting",
      "CrossFit",
      "Calisthenics",
      "Bodybuilding",
      "Kettlebell",
    ],
  },
  {
    label: "Team",
    sports: [
      "Football",
      "Basketball",
      "Volleyball",
      "Handball",
      "Field hockey",
      "Ice hockey",
      "Rugby",
      "American football",
      "Baseball",
      "Cricket",
    ],
  },
  {
    label: "Racket",
    sports: [
      "Tennis",
      "Badminton",
      "Squash",
      "Table tennis",
      "Padel",
      "Pickleball",
    ],
  },
  {
    label: "Water",
    sports: [
      "Swimming",
      "Open-water swimming",
      "Surfing",
      "Kayaking",
      "Stand-up paddling",
      "Sailing",
      "Water polo",
    ],
  },
  {
    label: "Winter",
    sports: [
      "Skiing",
      "Cross-country skiing",
      "Snowboarding",
      "Ski touring",
      "Ice skating",
    ],
  },
  {
    label: "Combat",
    sports: [
      "Boxing",
      "Kickboxing",
      "Judo",
      "Karate",
      "Brazilian jiu-jitsu",
      "Wrestling",
      "Fencing",
    ],
  },
  {
    label: "Mind and body",
    sports: ["Yoga", "Pilates", "Mobility", "Stretching", "Dance", "Tai chi"],
  },
  {
    label: "Other",
    sports: [
      "Climbing",
      "Bouldering",
      "Gymnastics",
      "Athletics",
      "Golf",
      "Horse riding",
      "Skateboarding",
    ],
  },
] as const satisfies readonly { label: string; sports: readonly string[] }[];

export const SPORT_NAME_MAX_LENGTH = 60;
/** More than the presets, so ticking every one still leaves room to add. */
export const SPORTS_MAX_COUNT = 100;

const PRESET_NAMES: ReadonlySet<string> = new Set(
  SPORT_PRESET_GROUPS.flatMap((group) =>
    group.sports.map((sport) => sport.toLocaleLowerCase()),
  ),
);

/** Whether a saved name is one of the presets, however it was capitalised. */
export function isPresetSport(name: string): boolean {
  return PRESET_NAMES.has(name.trim().toLocaleLowerCase());
}
