// Chris — an age-group triathlete in New York, imperial units, eleven weeks
// from an Olympic-distance race. Fixed masters swim slots, a roadmap with
// phases to the race, and a milestone already reached. The test: race-specific
// structure, a taper, units that stay in yards and miles, and a "today" that is
// six hours behind Berlin.

import { act, effort, lift, run, SAT, SUN, THU, TUE, WED } from "../lib.mjs";

const athlete = {
  key: "chris",
  // Fixed, so FITTIP_AI_OWNER_ALLOWLIST survives a re-seed.
  id: "00000000-0000-4000-a000-000000000005",
  email: "chris@fittip.local",
  displayName: "Chris",
  profile: {
    timezone: "America/New_York",
    birthDate: "1979-06-14",
    heightCm: 178,
    gender: "male",
    units: "imperial",
    sports: ["Swimming", "Cycling", "Running", "Strength"],
    sessionsPerWeek: 7,
    unavailableDays: ["friday"],
    availabilityNote:
      "Masters swim Tue/Thu 6:00–7:00. Weekday rides indoors only (before work). Long ride Saturday, long run Sunday.",
    trainingPlaces: [
      "YMCA pool (25 yd)",
      "Basement trainer",
      "Hudson River path",
      "Bear Mountain loop",
    ],
    homeEquipment: [
      "Smart trainer",
      "Tri bike",
      "Kettlebell 35 lb",
      "Pull-up bar",
    ],
  },
  weights: [
    [-56, 77.1],
    [-28, 76.2],
    [-2, 75.8],
  ],
  goals: [
    {
      key: "olympic",
      title: "Olympic tri under 2:45",
      outcome:
        "Finish the Olympic-distance race (1500 m / 40 km / 10 km) in under 2:45.",
      sports: ["Swimming", "Cycling", "Running"],
      target: 77,
      tier: "core",
    },
    {
      key: "swim",
      title: "Swim 1500 m continuous",
      outcome:
        "Swim 1650 yd freestyle without stopping, bilateral breathing, under 32 minutes.",
      sports: ["Swimming"],
      target: 42,
      tier: "core",
    },
    {
      key: "strength",
      title: "Strength twice a week",
      outcome:
        "Two short strength sessions a week for hips and core, to stay injury-free.",
      sports: ["Strength"],
      tier: "supporting",
    },
    {
      key: "sprint",
      title: "Finish a sprint triathlon",
      outcome: "Finish a sprint triathlon.",
      sports: ["Swimming", "Cycling", "Running"],
      tier: "supporting",
      then: "achieve",
    },
  ],
  memory: [
    {
      type: "profile_fact",
      content:
        "Swimmer since college but only 18 months of triathlon. Did a sprint in June (1:21).",
    },
    {
      type: "constraint",
      content:
        "Masters swim Tue and Thu 6:00 are fixed; the coach runs the workout.",
    },
    {
      type: "constraint",
      content: "Weekday rides are indoors on the trainer, 60 minutes at most.",
    },
    {
      type: "preference",
      content: "Long ride Saturday, long run Sunday. Prefers miles and yards.",
    },
    {
      type: "observed_pattern",
      content:
        "Bike FTP 238 W (test 4 weeks ago). Run threshold about 7:40/mi.",
    },
    {
      type: "constraint",
      content:
        "Race is a wetsuit-legal lake swim; has done only one open-water swim.",
    },
  ],
  library: [
    {
      key: "masters",
      name: "Masters swim",
      sport: "Swimming",
      kind: "run",
      value: run({ dist: 3000, unit: "yd" }),
    },
    {
      key: "trainer",
      name: "Trainer intervals",
      sport: "Cycling",
      kind: "effort",
      value: effort(60, "hard"),
    },
    {
      key: "longride",
      name: "Long ride",
      sport: "Cycling",
      kind: "run",
      value: run({ dist: 40, unit: "mi" }),
    },
    {
      key: "longrun",
      name: "Long run",
      sport: "Running",
      kind: "run",
      value: run({ dist: 8, unit: "mi", pace: "9:15" }),
    },
    {
      key: "brick",
      name: "Brick run",
      sport: "Running",
      description: "Straight off the bike.",
      kind: "run",
      value: run({ dist: 2, unit: "mi" }),
    },
    {
      key: "hips",
      name: "Hip & core circuit",
      sport: "Strength",
      kind: "lift",
      value: lift(3, 12, 35, "lb"),
    },
  ],
  series: [
    {
      weekdays: [TUE, THU],
      start: -56,
      title: "Masters swim",
      sport: "Swimming",
      intent: "Coached session.",
      minutes: 60,
      activities: [
        act(
          "Masters swim",
          "Swimming",
          "run",
          run({ dist: 3000, unit: "yd" }),
          { lib: "masters" },
        ),
      ],
      past: (n) =>
        n === 5
          ? { status: "skipped", note: "Pool closed." }
          : {
              status: "completed",
              minutes: 60,
              effort: 6,
              actual: [
                run({ dist: 2800 + (n % 4) * 100, unit: "yd", pace: "1:48" }),
              ],
            },
    },
    {
      weekdays: [WED],
      start: -56,
      title: "Trainer intervals",
      sport: "Cycling",
      intent: "4×8 min at threshold.",
      minutes: 60,
      activities: [
        act("Trainer intervals", "Cycling", "effort", effort(60, "hard"), {
          lib: "trainer",
        }),
        act("Hip & core circuit", "Strength", "lift", lift(3, 12, 35, "lb"), {
          lib: "hips",
        }),
      ],
      past: () => ({ status: "completed", minutes: 62, effort: 8 }),
    },
    {
      weekdays: [SAT],
      start: -56,
      title: "Long ride + brick",
      sport: "Cycling",
      intent: "Endurance, then a short run off the bike.",
      minutes: 180,
      activities: [
        act("Long ride", "Cycling", "run", run({ dist: 40, unit: "mi" }), {
          lib: "longride",
        }),
        act("Brick run", "Running", "run", run({ dist: 2, unit: "mi" }), {
          lib: "brick",
        }),
      ],
      past: (n) =>
        n === 3
          ? {
              status: "replaced",
              note: "Thunderstorms all day.",
              replacement: {
                title: "Trainer endurance",
                sport: "Cycling",
                minutes: 120,
                effort: 5,
                activities: [
                  act(
                    "Trainer ride",
                    "Cycling",
                    "effort",
                    effort(120, "moderate"),
                  ),
                ],
              },
            }
          : {
              status: "completed",
              minutes: 170 + n * 5,
              effort: 6,
              actual: [
                run({ dist: 34 + n * 1.5, unit: "mi" }),
                run({ dist: 2, unit: "mi", pace: "8:40" }),
              ],
            },
    },
    {
      weekdays: [SUN],
      start: -56,
      title: "Long run",
      sport: "Running",
      intent: "Easy, conversational.",
      minutes: 80,
      activities: [
        act(
          "Long run",
          "Running",
          "run",
          run({ dist: 8, unit: "mi", pace: "9:15" }),
          { lib: "longrun" },
        ),
      ],
      past: (n) => ({
        status: "completed",
        minutes: 65 + n * 3,
        effort: 5,
        actual: [run({ dist: 6.5 + n * 0.3, unit: "mi", pace: "9:20" })],
        note: n === 6 ? "Left hip flexor tight in the last mile." : undefined,
      }),
    },
  ],
  sessions: [
    {
      day: 20,
      title: "Open-water practice",
      sport: "Swimming",
      intent: "Sighting and wetsuit, with a buddy.",
      minutes: 45,
      activities: [
        act(
          "Open-water swim",
          "Swimming",
          "run",
          run({ dist: 1200, unit: "yd" }),
        ),
      ],
    },
    {
      day: 77,
      title: "Race: Olympic triathlon",
      sport: "Triathlon",
      intent: "A race. Swim steady, bike at 85% FTP, run negative split.",
      minutes: 165,
      note: "Check-in 6:00, wave start 7:20.",
      activities: [
        act("Swim", "Swimming", "run", run({ dist: 1640, unit: "yd" })),
        act("Bike", "Cycling", "run", run({ dist: 24.8, unit: "mi" })),
        act(
          "Run",
          "Running",
          "run",
          run({ dist: 6.2, unit: "mi", pace: "8:10" }),
        ),
      ],
    },
  ],
  unplanned: [
    {
      day: -9,
      title: "Open-water swim",
      sport: "Swimming",
      minutes: 30,
      effort: 6,
      note: "First time in a wetsuit. Panicky first 5 minutes, then fine.",
      activities: [
        act(
          "Open-water swim",
          "Swimming",
          "run",
          run({ dist: 900, unit: "yd" }),
        ),
      ],
    },
  ],
  roadmap: {
    title: "Road to the Olympic tri",
    summary: "Build, then race-specific, then a ten-day taper.",
    end: 80,
    phases: [
      {
        title: "Build",
        focus: "Longer swims without stopping, bike threshold, run volume.",
        start: 0,
        end: 41,
        attention: [
          ["olympic", "primary"],
          ["swim", "primary"],
          ["strength", "maintenance"],
        ],
        milestones: [
          {
            title: "First open-water swim",
            day: 3,
            goals: ["swim"],
            reached: true,
          },
          {
            title: "1650 yd continuous",
            details: "Bilateral breathing, under 32 min.",
            day: 40,
            goals: ["swim"],
          },
        ],
      },
      {
        title: "Race-specific",
        focus: "Bricks at race effort, open-water sighting.",
        start: 42,
        end: 66,
        attention: [
          ["olympic", "primary"],
          ["strength", "maintenance"],
        ],
        milestones: [
          {
            title: "Race-pace brick: 20 mi + 4 mi",
            day: 60,
            goals: ["olympic"],
          },
        ],
      },
      {
        title: "Taper & race",
        focus: "Volume down, a little intensity, sleep.",
        start: 67,
        end: 80,
        attention: [["olympic", "primary"]],
        milestones: [{ title: "Race under 2:45", day: 77, goals: ["olympic"] }],
      },
    ],
  },
};

export default athlete;
