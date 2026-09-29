/**
 * PROTOTYPE — throwaway sample data for the Today design prototype.
 * Shaped loosely on TodaySessionView; nothing here touches the database.
 */

export type ProtoOutcome = "done" | "partly" | "skipped";

export type ProtoActivity = { name: string; target: string };

export type ProtoSession = {
  id: string;
  title: string;
  sport: "Run" | "Strength" | "Mobility" | "Ride";
  minutes: number;
  /** 1–5, the training zone the session mostly sits in. */
  zone: 1 | 2 | 3 | 4 | 5;
  /** The coach's one-line reason, in plain words. */
  why: string;
  /** The workout's shape: [minutes, zone] blocks in order. */
  profile: [number, 1 | 2 | 3 | 4 | 5][];
  activities: ProtoActivity[];
};

export type ProtoDay = {
  date: string;
  weekday: string;
  short: string;
  dayOfMonth: number;
  isRecovery: boolean;
  sessions: ProtoSession[];
  /** Completions already logged before the prototype opened. */
  logged: Record<string, ProtoOutcome>;
};

export const TODAY = "2026-09-29";

export const WEEK: ProtoDay[] = [
  {
    date: "2026-09-28",
    weekday: "Monday",
    short: "Mon",
    dayOfMonth: 28,
    isRecovery: false,
    sessions: [
      {
        id: "mon-easy",
        title: "Easy run",
        sport: "Run",
        minutes: 40,
        zone: 2,
        why: "Easy miles keep the week's volume without adding fatigue.",
        profile: [[40, 2]],
        activities: [{ name: "Easy run", target: "40 min · 6:00/km" }],
      },
    ],
    logged: { "mon-easy": "done" },
  },
  {
    date: "2026-09-29",
    weekday: "Tuesday",
    short: "Tue",
    dayOfMonth: 29,
    isRecovery: false,
    sessions: [
      {
        id: "tue-tempo",
        title: "Tempo run",
        sport: "Run",
        minutes: 45,
        zone: 4,
        why: "Raises your threshold for the October 10k.",
        profile: [
          [10, 2],
          [8, 4],
          [2, 1],
          [8, 4],
          [2, 1],
          [8, 4],
          [7, 2],
        ],
        activities: [
          { name: "Warm-up", target: "10 min easy" },
          { name: "Tempo", target: "3 × 8 min · 4:50/km" },
          { name: "Jog recovery", target: "2 × 2 min" },
          { name: "Cool-down", target: "7 min easy" },
        ],
      },
      {
        id: "tue-mobility",
        title: "Hip mobility",
        sport: "Mobility",
        minutes: 15,
        zone: 1,
        why: "Keeps your stride open after harder running.",
        profile: [[15, 1]],
        activities: [
          { name: "90/90 switches", target: "2 × 10" },
          { name: "Couch stretch", target: "2 × 60 s each side" },
          { name: "Glute bridge", target: "3 × 12" },
        ],
      },
    ],
    logged: {},
  },
  {
    date: "2026-09-30",
    weekday: "Wednesday",
    short: "Wed",
    dayOfMonth: 30,
    isRecovery: true,
    sessions: [],
    logged: {},
  },
  {
    date: "2026-10-01",
    weekday: "Thursday",
    short: "Thu",
    dayOfMonth: 1,
    isRecovery: false,
    sessions: [
      {
        id: "thu-strength",
        title: "Lower-body strength",
        sport: "Strength",
        minutes: 50,
        zone: 3,
        why: "Strong legs hold your form late in a race.",
        profile: [
          [8, 2],
          [12, 3],
          [2, 1],
          [12, 3],
          [2, 1],
          [14, 3],
        ],
        activities: [
          { name: "Back squat", target: "4 × 6 · 80 kg" },
          { name: "Romanian deadlift", target: "3 × 8 · 60 kg" },
          { name: "Walking lunge", target: "3 × 12" },
        ],
      },
    ],
    logged: {},
  },
  {
    date: "2026-10-02",
    weekday: "Friday",
    short: "Fri",
    dayOfMonth: 2,
    isRecovery: false,
    sessions: [
      {
        id: "fri-easy",
        title: "Easy run",
        sport: "Run",
        minutes: 35,
        zone: 2,
        why: "Loosens up the legs before the long run.",
        profile: [[35, 2]],
        activities: [{ name: "Easy run", target: "35 min · 6:00/km" }],
      },
    ],
    logged: {},
  },
  {
    date: "2026-10-03",
    weekday: "Saturday",
    short: "Sat",
    dayOfMonth: 3,
    isRecovery: false,
    sessions: [
      {
        id: "sat-long",
        title: "Long run",
        sport: "Run",
        minutes: 80,
        zone: 2,
        why: "The long run builds the endurance the 10k is made of.",
        profile: [
          [70, 2],
          [10, 3],
        ],
        activities: [{ name: "Long run", target: "14 km · 5:45/km" }],
      },
    ],
    logged: {},
  },
  {
    date: "2026-10-04",
    weekday: "Sunday",
    short: "Sun",
    dayOfMonth: 4,
    isRecovery: true,
    sessions: [],
    logged: {},
  },
];

/** Days in a row the plan was kept, rest days included, before this week. */
export const STREAK_BEFORE_WEEK = 11;

export const GOAL = { title: "10k under 48 min", date: "18 Oct", weeksLeft: 3 };
