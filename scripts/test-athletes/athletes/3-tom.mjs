// Tom — a marathoner coming back from Achilles tendinopathy. Cycling kept his
// fitness; running is walk-run under a physio's rule, with pain flagged on
// several logs and the most recent one two days ago. The coach's cautious
// path: nothing should add intensity or impact after a flag.

import {
  act,
  effort,
  intervals,
  lift,
  MON,
  run,
  SAT,
  SUN,
  THU,
  TUE,
} from "../lib.mjs";

const calfRaises = (sets, reps, kg) =>
  act("Single-leg calf raises", "Strength", "lift", lift(sets, reps, kg), {
    lib: "calf",
    instructions: "3 s up, 3 s down, knee straight. Pain during ≤ 3/10.",
  });

const athlete = {
  key: "tom",
  // Fixed, so FITTIP_AI_OWNER_ALLOWLIST survives a re-seed.
  id: "00000000-0000-4000-a000-000000000003",
  email: "tom@fittip.local",
  displayName: "Tom",
  profile: {
    timezone: "Europe/Berlin",
    birthDate: "1984-02-02",
    heightCm: 183,
    gender: "male",
    units: "metric",
    sports: ["Running", "Cycling", "Strength"],
    sessionsPerWeek: 5,
    unavailableDays: ["friday"],
    availabilityNote:
      "Lunch breaks (60 min) on weekdays, long sessions on weekends.",
    trainingPlaces: ["Home (indoor trainer)", "Forest trails", "Office gym"],
    homeEquipment: [
      "Smart trainer",
      "Road bike",
      "Dumbbells up to 20 kg",
      "Step",
    ],
  },
  weights: [
    [-49, 79.5],
    [-21, 80.2],
    [-1, 80.0],
  ],
  goals: [
    {
      key: "return",
      title: "Run 30 minutes pain-free",
      outcome:
        "Run 30 minutes continuously on flat ground with Achilles pain at most 2/10 during and no worse the next morning, three times in one week.",
      sports: ["Running"],
      target: 70,
      tier: "core",
    },
    {
      key: "bike",
      title: "Keep cycling fitness",
      outcome: "Hold FTP around 260 W while running is limited.",
      sports: ["Cycling"],
      tier: "core",
    },
    {
      key: "calf",
      title: "Calf strength 3×15 single-leg",
      outcome:
        "Do 3×15 single-leg calf raises on each side with 10 kg, pain-free.",
      sports: ["Strength"],
      target: 42,
      tier: "supporting",
    },
    {
      key: "marathon",
      title: "Sub-3:20 marathon",
      outcome: "Run a marathon under 3:20.",
      sports: ["Running"],
      tier: "supporting",
      then: "pause",
    },
  ],
  memory: [
    {
      type: "profile_fact",
      content:
        "Ran four marathons, best 3:25 (2025). Running 60–70 km a week before the injury.",
    },
    {
      type: "constraint",
      content:
        "Achilles tendinopathy (right), diagnosed by a physio seven weeks ago. Physio's rule: pain during running at most 3/10, and it must not be worse the next morning. If it is, go back one step.",
    },
    {
      type: "constraint",
      content:
        "No hills, no speedwork, no barefoot or minimal shoes until the physio clears it.",
    },
    {
      type: "observed_pattern",
      content:
        "When a run feels easy he adds a few minutes or picks up the pace, and the Achilles is worse the next morning.",
    },
    {
      type: "preference",
      content:
        "Likes structured trainer workouts with power targets. Hates running on a treadmill.",
    },
    {
      type: "constraint",
      content:
        "Physio appointment every second Wednesday; the next one is in 5 days.",
      expires: 5,
    },
  ],
  library: [
    {
      key: "walkrun",
      name: "Walk-run",
      sport: "Running",
      description: "Flat, soft surface.",
      kind: "run",
      value: run({ min: 30 }),
    },
    {
      key: "calf",
      name: "Single-leg calf raises",
      sport: "Strength",
      kind: "lift",
      value: lift(3, 12, 0),
    },
    {
      key: "z2",
      name: "Endurance ride (Z2)",
      sport: "Cycling",
      description: "65–75% FTP.",
      kind: "effort",
      value: effort(60, "easy"),
    },
    {
      key: "sweetspot",
      name: "Sweet spot intervals",
      sport: "Cycling",
      description: "88–93% FTP.",
      kind: "intervals",
      value: intervals([[3, { sec: 720, rest: 300 }]]),
    },
    {
      key: "split",
      name: "Split squat",
      sport: "Strength",
      kind: "lift",
      value: lift(3, 10, 12),
    },
  ],
  series: [
    {
      weekdays: [MON, THU],
      start: -42,
      title: "Walk-run + calf rehab",
      sport: "Running",
      intent: "Load the tendon gradually. Stop if pain > 3/10.",
      minutes: 40,
      activities: [
        act("Walk-run", "Running", "run", run({ min: 25 }), {
          lib: "walkrun",
          instructions: "6× (2 min run, 2 min walk), flat.",
        }),
        calfRaises(3, 12, 0),
      ],
      past: (n) => {
        const notes = {
          3: {
            pain: true,
            note: "Achilles 4/10 next morning. Physio said to go back a step.",
          },
          4: {
            pain: true,
            note: "Still stiff in the morning, 3/10. Did only the calf raises.",
            partial: true,
          },
          8: { pain: true, note: "Fine during, 3/10 stiff next morning." },
          11: {
            pain: true,
            note: "Morning stiffness 3/10, gone after 10 minutes of walking.",
          },
        }[n];
        if (n === 6) return { status: "skipped", note: "Business trip." };
        if (notes?.partial)
          return {
            status: "partially_completed",
            minutes: 15,
            effort: 3,
            actual: [null, lift(3, 12, 0)],
            note: notes.note,
            flags: { pain: true },
          };
        return {
          status: "completed",
          minutes: 40,
          effort: 4,
          actual: [
            run({ min: 24 + Math.min(n, 9), dist: 3 + n * 0.2 }),
            lift(3, 12 + Math.min(n, 3), n > 7 ? 5 : 0),
          ],
          note: notes?.note,
          flags: notes ? { pain: true } : undefined,
        };
      },
    },
    {
      weekdays: [TUE, SAT],
      start: -42,
      title: "Trainer: endurance",
      sport: "Cycling",
      intent: "Keep the aerobic base.",
      minutes: 75,
      activities: [
        act("Endurance ride (Z2)", "Cycling", "effort", effort(75, "easy"), {
          lib: "z2",
        }),
      ],
      past: (n) => ({
        status: "completed",
        minutes: n % 4 === 3 ? 120 : 75,
        effort: n % 4 === 3 ? 6 : 4,
        actual: [effort(n % 4 === 3 ? 120 : 75, "easy")],
        note: n % 4 === 3 ? "Outdoor ride, 62 km." : undefined,
      }),
    },
    {
      weekdays: [SUN],
      start: -42,
      title: "Sweet spot",
      sport: "Cycling",
      intent: "3×12 min at 88–93% FTP.",
      minutes: 60,
      activities: [
        act(
          "Sweet spot intervals",
          "Cycling",
          "intervals",
          intervals([[3, { sec: 720, rest: 300 }]]),
          { lib: "sweetspot" },
        ),
        act("Split squat", "Strength", "lift", lift(3, 10, 12), {
          lib: "split",
        }),
      ],
      past: (n) =>
        n === 2
          ? { status: "skipped", note: "Family birthday." }
          : { status: "completed", minutes: 62, effort: 7 },
    },
  ],
  sessions: [
    {
      day: 11,
      title: "Physio check: 20 min continuous",
      sport: "Running",
      intent: "Only if the last three walk-runs were ≤ 2/10 next morning.",
      minutes: 30,
      activities: [act("Continuous jog", "Running", "run", run({ min: 20 }))],
    },
  ],
  unplanned: [
    {
      day: -12,
      title: "Hike with the kids",
      sport: "Hiking",
      minutes: 150,
      effort: 3,
      note: "Achilles fine during, a bit stiff next morning (2/10).",
      flags: { pain: true },
      activities: [act("Hike", "Hiking", "run", run({ min: 150, dist: 9 }))],
    },
  ],
  recoveryDays: [5],
  roadmap: {
    title: "Back to running",
    summary:
      "Tendon first, running volume second, speed last. Cycling holds the engine.",
    end: 84,
    phases: [
      {
        title: "Reload the tendon",
        focus:
          "Walk-run progressions only when the morning is calm. Heavy calf work.",
        start: 0,
        end: 41,
        attention: [
          ["return", "primary"],
          ["bike", "secondary"],
          ["calf", "primary"],
        ],
        milestones: [
          {
            title: "20 minutes continuous",
            details: "Pain ≤ 2/10 during and next morning.",
            day: 21,
            goals: ["return"],
          },
          { title: "3×15 calf raises with 10 kg", day: 40, goals: ["calf"] },
        ],
      },
      {
        title: "Build running time",
        focus: "From 20 to 30 minutes continuous, three runs a week, flat.",
        start: 42,
        end: 84,
        attention: [
          ["return", "primary"],
          ["bike", "maintenance"],
        ],
        milestones: [
          { title: "3× 30 minutes in one week", day: 70, goals: ["return"] },
        ],
      },
    ],
  },
};

export default athlete;
