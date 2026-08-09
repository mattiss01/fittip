/**
 * Cold start — a brand new account with no training history at all.
 *
 * The most common real case, and the product owner's own situation: goals set
 * during onboarding, a handful of intake-confirmed memory items, and nothing
 * else. `returning-trail-runner` tests whether a model can hold many signals at
 * once; this tests the opposite failure — whether it invents signals it was
 * never given.
 *
 * A model that writes "building on your recent consistency" here has
 * hallucinated a training history, and would do the same to a real new user on
 * their first day.
 */

import {
  planWindow,
  weekdayOf,
  allPlanText,
  allRoadmapText,
  WORDS,
} from "./_shared.mjs";

export const TODAY = "2026-08-08";

const targetableGoals = [
  {
    id: "6b2e4a91-7c05-4d38-8f16-92a4c07e5b31",
    title: "Run 5 km without stopping",
    category: "endurance",
    priorityTier: "core",
    targetDate: "2026-11-15",
  },
  {
    id: "0d5f8c34-1a67-4b92-a3e8-47b60d29fc85",
    title: "Move on purpose three times a week",
    category: "recovery_general_fitness",
    priorityTier: "supporting",
    targetDate: null,
  },
];

/** Nothing achieved yet. The list exists so its emptiness is itself testable. */
const historicalGoals = [];

const memory = [
  {
    id: "8f31b092-5d47-4e6a-bc18-3a09e75d4b62",
    memoryType: "profile_fact",
    content:
      "41 years old. Has not trained regularly for about six years. Desk job, walks the dog most evenings. Signed up after a work colleague mentioned a charity 5K in November.",
  },
  {
    id: "c47a2e58-9b03-4f71-8d62-15e08a3c9b47",
    memoryType: "constraint",
    content:
      "Can train Tuesday, Thursday, and one weekend day. Weekday sessions have to fit in a lunch break, so about 45 minutes including changing.",
  },
  {
    id: "2e9d5f16-8a34-4c07-b95e-06f31d8a4c72",
    memoryType: "preference",
    content:
      "Would rather be outdoors than in a gym. Nervous about looking unfit in front of other people.",
  },
];

/** Empty. A new account has logged nothing. */
const trainingHistory = [];

/** A new user has no idea what to write here yet. */
const planningNote = "";

// --- probes ----------------------------------------------------------------

const WINDOW = planWindow(TODAY);

/**
 * Language that asserts a training history this athlete does not have. Narrow
 * on purpose: "your goal" is fine, "your recent training" is a fabrication.
 */
const CLAIMED_HISTORY =
  /\b(your (recent|current|existing|last|previous) (training|sessions?|weeks?|runs?|volume|mileage|block)|building on (your|the) (consistency|base|progress|momentum)|as you('| ha)ve been (doing|running|training)|since your last|compared to last week|maintain your current (volume|mileage|fitness))\b/i;

export const scenario = {
  name: "cold-start",
  title: "Brand new account, no training history",
  purpose:
    "The most common real case and the product owner's own. Tests whether a model invents a training history it was never given, and whether it proposes conservatively for someone six years detrained rather than assuming a baseline.",
  today: TODAY,
  context: {
    today: TODAY,
    targetableGoals,
    historicalGoals,
    memory,
    trainingHistory,
    planningNote,
  },
  planProbes: [
    {
      id: "inventsNoHistory",
      label: "Does not invent a training history",
      mustPass: true,
      check: (sessions) => !CLAIMED_HISTORY.test(allPlanText(sessions)),
    },
    {
      id: "respectsAvailableDays",
      label: "Only Tue / Thu / one weekend day",
      mustPass: true,
      check: (sessions) => {
        const allowed = new Set(["Tuesday", "Thursday", "Saturday", "Sunday"]);
        const weekendUsed = sessions.filter((s) =>
          ["Saturday", "Sunday"].includes(dayName(s.date)),
        ).length;
        return (
          sessions.every((s) => allowed.has(dayName(s.date))) && weekendUsed <= 1
        );
      },
    },
    {
      id: "weekdaySessionsFitLunch",
      label: "Weekday sessions <= 45 min",
      mustPass: true,
      check: (sessions) =>
        sessions
          .filter((s) => ["Tuesday", "Thursday"].includes(dayName(s.date)))
          .every((s) => Number(s.durationMinutes) <= 45),
    },
    {
      id: "conservativeFirstWeek",
      label: "Conservative first week (<= 180 min total)",
      check: (sessions) =>
        sessions.reduce((n, s) => n + (Number(s.durationMinutes) || 0), 0) <=
        180,
    },
    {
      id: "atMostThreeSessions",
      label: "At most three sessions",
      check: (sessions) => sessions.length <= 3,
    },
    {
      id: "noGymPrescribed",
      label: "Respects the outdoors preference",
      check: (sessions) => !WORDS.gym.test(allPlanText(sessions)),
    },
  ],
  roadmapProbes: [
    {
      id: "inventsNoHistory",
      label: "Does not invent a training history",
      mustPass: true,
      check: (parsed) => !CLAIMED_HISTORY.test(allRoadmapText(parsed)),
    },
    {
      id: "referencesOnlyRealGoals",
      label: "Every phase serves one of the two real goals",
      check: (parsed) =>
        (parsed?.phases ?? []).every((p) =>
          targetableGoals.some((g) => g.id === p.goalId),
        ),
    },
    {
      id: "reachesTheEvent",
      label: "Covers the November target date",
      check: (parsed) =>
        (parsed?.phases ?? []).some((p) => p.endDate >= "2026-11-15"),
    },
  ],
};

/** A date outside the requested window is a contract failure, not a weekday. */
function dayName(iso) {
  return WINDOW.includes(iso) ? weekdayOf(iso) : "outside";
}
