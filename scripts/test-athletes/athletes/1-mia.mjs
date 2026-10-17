// Mia — a beginner runner three weeks in. Little history, short memory, one
// core goal and no roadmap yet: the coach's thinnest input, and the app's
// "Create your roadmap" path.

import { act, effort, lift, run, SAT, SUN, TUE } from "../lib.mjs";

const runWalk = (blocks, runMin, walkMin) =>
  act(
    "Run/walk intervals",
    "Running",
    "run",
    run({ min: blocks * (runMin + walkMin) }),
    {
      lib: "runwalk",
      instructions: `${blocks}× ${runMin} min easy jog, ${walkMin} min walk. Jog slow enough to talk.`,
    },
  );

const athlete = {
  key: "mia",
  // Fixed, so FITTIP_AI_OWNER_ALLOWLIST survives a re-seed.
  id: "00000000-0000-4000-a000-000000000001",
  email: "mia@fittip.local",
  displayName: "Mia",
  profile: {
    timezone: "Europe/Berlin",
    birthDate: "1996-04-11",
    heightCm: 168,
    gender: "female",
    units: "metric",
    sports: ["Running"],
    sessionsPerWeek: 3,
    unavailableDays: ["monday", "thursday"],
    availabilityNote:
      "Weekdays after 18:30 only. Saturday mornings are free. Thursdays I have choir.",
    trainingPlaces: ["Park near home", "Neighbourhood streets"],
    homeEquipment: ["Yoga mat"],
  },
  weights: [
    [-24, 66.4],
    [-3, 65.9],
  ],
  goals: [
    {
      key: "5k",
      title: "Run 5 km without walking",
      outcome:
        "Run 5 km continuously at an easy pace, without walk breaks, by the end of the course.",
      sports: ["Running"],
      target: 56,
      tier: "core",
    },
    {
      key: "habit",
      title: "Make running a habit",
      outcome: "Train three times a week for two months without a missed week.",
      sports: ["Running"],
      tier: "supporting",
    },
  ],
  memory: [
    {
      type: "profile_fact",
      content:
        "Started running three weeks ago. Never trained regularly before; did some hiking and cycling to work.",
    },
    {
      type: "constraint",
      content:
        "Had shin splints in 2022 after going from nothing to running 4× a week. Wants a slow build.",
    },
    {
      type: "preference",
      content:
        "Prefers running outside. Finds the treadmill boring and would rather walk.",
    },
  ],
  library: [
    {
      key: "runwalk",
      name: "Run/walk intervals",
      sport: "Running",
      description: "Alternating easy jogging and brisk walking.",
      kind: "run",
      value: run({ min: 30 }),
    },
    {
      key: "calf",
      name: "Calf raises",
      sport: "Strength",
      description: "Slow up, slower down, on a step.",
      kind: "lift",
      value: lift(2, 15),
    },
    {
      key: "hips",
      name: "Hip mobility",
      sport: "Mobility",
      kind: "effort",
      value: effort(10, "easy"),
    },
  ],
  series: [
    {
      weekdays: [TUE, SAT],
      start: -21,
      title: "Run/walk",
      sport: "Running",
      intent: "Build the habit and time on feet without pain.",
      minutes: 35,
      activities: [
        runWalk(6, 3, 2),
        act("Calf raises", "Strength", "lift", lift(2, 15), { lib: "calf" }),
      ],
      past: (n) =>
        [
          {
            status: "completed",
            minutes: 33,
            effort: 5,
            note: "Harder than I thought!",
          },
          { status: "completed", minutes: 35, effort: 4 },
          {
            status: "partially_completed",
            minutes: 20,
            effort: 6,
            actual: [run({ min: 20, dist: 2.4 }), null],
            note: "Rain and a side stitch, walked home after 4 blocks.",
          },
          { status: "skipped", note: "Worked late." },
          {
            status: "completed",
            minutes: 36,
            effort: 4,
            actual: [run({ min: 30, dist: 3.6, pace: "8:20" }), lift(2, 15)],
            note: "Felt good, shins fine.",
          },
          { status: "completed", minutes: 35, effort: 4 },
        ][n] ?? null,
    },
    {
      weekdays: [SUN],
      start: 2,
      title: "Easy walk + mobility",
      sport: "Walking",
      intent: "Active recovery on Sunday.",
      minutes: 30,
      activities: [
        act("Brisk walk", "Walking", "effort", effort(20, "easy")),
        act("Hip mobility", "Mobility", "effort", effort(10, "easy"), {
          lib: "hips",
        }),
      ],
    },
  ],
  sessions: [
    {
      day: 9,
      title: "First continuous 2 km",
      sport: "Running",
      intent: "A test, not a race: see if 2 km goes without walking.",
      minutes: 25,
      activities: [act("Continuous jog", "Running", "run", run({ dist: 2 }))],
    },
  ],
  unplanned: [
    {
      day: -10,
      title: "Walk with a friend",
      sport: "Walking",
      minutes: 60,
      effort: 2,
      activities: [act("Walk", "Walking", "run", run({ min: 60, dist: 5.2 }))],
    },
  ],
};

export default athlete;
