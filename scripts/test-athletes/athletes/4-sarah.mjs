// Sarah — a parent of two with thirty minutes before the kids wake. Home
// equipment only, many skipped and cancelled sessions with reasons, a stroller
// walk logged in place of a run, and a business trip ahead. No roadmap. The
// test: does the coach plan around real life instead of "catching up"?

import { act, effort, lift, MON, run, SUN, THU } from "../lib.mjs";

const homeStrength = [
  act("Kettlebell swings", "Strength", "lift", lift(4, 15, 16), {
    lib: "swing",
  }),
  act("Push-ups", "Strength", "lift", lift(3, 8), {
    lib: "pushup",
    instructions: "Knees down for the last set if needed.",
  }),
  act("Goblet squat", "Strength", "lift", lift(3, 10, 16), { lib: "goblet" }),
  act("Band rows", "Strength", "lift", lift(3, 12)),
];

const reasons = [
  "Kid sick, up all night.",
  "Overslept.",
  "Daycare closed, no time.",
  "Too tired after a bad night.",
];

const athlete = {
  key: "sarah",
  // Fixed, so FITTIP_AI_OWNER_ALLOWLIST survives a re-seed.
  id: "00000000-0000-4000-a000-000000000004",
  email: "sarah@fittip.local",
  displayName: "Sarah",
  profile: {
    timezone: "Europe/Vienna",
    birthDate: "1988-11-30",
    heightCm: 164,
    gender: "female",
    units: "metric",
    sports: ["Strength", "Running", "Yoga"],
    sessionsPerWeek: 3,
    unavailableDays: ["tuesday", "wednesday"],
    availabilityNote:
      "Weekdays only 5:45–6:15 before the kids wake. Sunday afternoon about an hour while my partner has the kids.",
    trainingPlaces: ["Home (living room)", "Neighbourhood", "Playground"],
    homeEquipment: [
      "Kettlebell 16 kg",
      "Dumbbells 2× 8 kg",
      "Resistance bands",
      "Yoga mat",
      "Jogging stroller",
    ],
  },
  weights: [[-30, 68.0]],
  goals: [
    {
      key: "pushups",
      title: "20 push-ups",
      outcome: "Do 20 full push-ups in a row.",
      sports: ["Strength"],
      target: 90,
      tier: "core",
    },
    {
      key: "run30",
      title: "Run 30 minutes without stopping",
      outcome:
        "Run 30 minutes at an easy pace without walking, like before the second child.",
      sports: ["Running"],
      target: 75,
      tier: "core",
    },
    {
      key: "move",
      title: "Move three times a week",
      outcome:
        "Any three sessions a week, even short ones, so I feel like myself.",
      sports: ["Strength", "Running", "Yoga"],
      tier: "supporting",
    },
  ],
  memory: [
    {
      type: "profile_fact",
      content:
        "Two kids, 3 and 6. Sleep is often interrupted. Ran regularly (3×/week, 10 km races) until 2021.",
    },
    {
      type: "constraint",
      content:
        "Weekday sessions are 30 minutes at most, and only at home or from the front door.",
    },
    {
      type: "preference",
      content:
        "Home workouts with the kettlebell. No gym membership and doesn't want one.",
    },
    {
      type: "constraint",
      content:
        "Business trip to Hamburg for a week, starting in 10 days. Hotel has a small gym (treadmill, dumbbells to 12 kg).",
      expires: 17,
    },
    {
      type: "observed_pattern",
      content:
        "After a missed session she tries to do two the next day and then skips the rest of the week.",
    },
  ],
  library: [
    {
      key: "swing",
      name: "Kettlebell swings",
      sport: "Strength",
      kind: "lift",
      value: lift(4, 15, 16),
    },
    {
      key: "pushup",
      name: "Push-ups",
      sport: "Strength",
      kind: "lift",
      value: lift(3, 8),
    },
    {
      key: "goblet",
      name: "Goblet squat",
      sport: "Strength",
      kind: "lift",
      value: lift(3, 10, 16),
    },
    {
      key: "easy",
      name: "Easy run",
      sport: "Running",
      kind: "run",
      value: run({ min: 25 }),
    },
    {
      key: "yoga",
      name: "Yoga flow",
      sport: "Yoga",
      kind: "effort",
      value: effort(30, "easy"),
    },
  ],
  saved: [
    {
      name: "15-minute emergency",
      title: "15 min kettlebell",
      sport: "Strength",
      intent: "When the morning goes wrong: something beats nothing.",
      minutes: 15,
      activities: [homeStrength[0], homeStrength[1]],
    },
  ],
  series: [
    {
      weekdays: [MON, THU],
      start: -56,
      title: "Home strength",
      sport: "Strength",
      intent: "Full body in 30 minutes.",
      minutes: 30,
      activities: homeStrength,
      past: (n) => {
        if ([2, 5, 9, 12].includes(n))
          return { cancel: reasons[n % reasons.length] };
        if ([3, 10].includes(n))
          return { status: "skipped", note: reasons[(n + 1) % reasons.length] };
        if (n === 7)
          return {
            status: "partially_completed",
            minutes: 15,
            effort: 6,
            actual: [lift(4, 15, 16), lift(3, 6), null, null],
            note: "Little one woke up early.",
          };
        return {
          status: "completed",
          minutes: 30,
          effort: 6,
          actual: [
            lift(4, 15, 16),
            lift(3, Math.min(6 + Math.floor(n / 3), 10)),
            lift(3, 10, 16),
            lift(3, 12),
          ],
        };
      },
      cancelAhead: [{ from: 10, to: 16, reason: "Business trip to Hamburg." }],
    },
    {
      weekdays: [SUN],
      start: -56,
      title: "Sunday run",
      sport: "Running",
      intent: "Easy, run/walk if needed.",
      minutes: 40,
      activities: [
        act("Easy run", "Running", "run", run({ min: 25 }), { lib: "easy" }),
      ],
      past: (n) => {
        if (n === 1 || n === 5)
          return {
            status: "replaced",
            note: "Partner was away, took the kids.",
            replacement: {
              title: "Stroller walk",
              sport: "Walking",
              minutes: 50,
              effort: 3,
              activities: [
                act(
                  "Walk with stroller",
                  "Walking",
                  "run",
                  run({ min: 50, dist: 4.5 }),
                ),
              ],
            },
          };
        if (n === 3) return { status: "skipped", note: "Family visit." };
        return {
          status: "completed",
          minutes: 35,
          effort: 5,
          actual: [run({ min: 18 + n, dist: 2.5 + n * 0.3, pace: "7:10" })],
          note:
            n === 6
              ? "First 25 minutes without walking since 2021!"
              : undefined,
        };
      },
    },
  ],
  unplanned: [
    {
      day: -20,
      title: "Yoga before bed",
      sport: "Yoga",
      minutes: 20,
      effort: 2,
      activities: [
        act("Yoga flow", "Yoga", "effort", effort(20, "easy"), { lib: "yoga" }),
      ],
    },
    {
      day: -6,
      title: "Playground circuit",
      sport: "Strength",
      minutes: 15,
      effort: 5,
      note: "While the kids played. Pull-ups on the climbing frame: 0, but hung for 20 s.",
      activities: [
        act("Dead hang", "Strength", "custom", {
          label: "Hang",
          value: 20,
          unit: "s",
        }),
      ],
    },
  ],
  recoveryDays: [1],
};

export default athlete;
