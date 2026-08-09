/**
 * A pure strength athlete — no endurance goals, no running, no cardio.
 *
 * This exists because the other scenarios cannot test a product invariant.
 * M3-03's scope says "structured **sport-agnostic** sessions", and a corpus in
 * which every athlete runs lets a model coast on the assumption that coaching
 * means endurance coaching. The failure this catches is a model that quietly
 * prescribes "an easy 30-minute run for recovery" to a powerlifter eight weeks
 * out from a meet — plausible-sounding, and wrong for this athlete.
 *
 * It also tests a different kind of scheduling competence: heavy lower-body days
 * need separation, which is a structural constraint rather than a safety signal.
 */

import {
  session,
  daysBefore,
  planWindow,
  allPlanText,
  allRoadmapText,
  WORDS,
} from "./_shared.mjs";

export const TODAY = "2026-08-08";
const daysAgo = (n) => daysBefore(TODAY, n);

const ACTIVITY_ID = "c9d0e1f2-a3b4-4c56-8d78-9e0f1a2b3c45";

const targetableGoals = [
  {
    id: "72b4e806-1d59-4f37-a8c2-63e05b19d7a4",
    title: "Total 500 kg at the October meet",
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-10-17",
  },
  {
    id: "18c5f930-7e26-4a84-b013-5d9f24e8c760",
    title: "Squat 190 kg",
    category: "strength",
    priorityTier: "core",
    targetDate: "2026-10-17",
  },
  {
    id: "a40d7b61-3c82-4e95-8f17-2b60c53e9d18",
    title: "Bench 130 kg",
    category: "strength",
    priorityTier: "core",
    targetDate: "2026-10-17",
  },
  {
    id: "6e319d47-5a08-4b72-9c46-f81205a3e6b9",
    title: "Keep bodyweight under 93 kg",
    category: "body_composition",
    priorityTier: "supporting",
    targetDate: "2026-10-17",
  },
];

const historicalGoals = [
  {
    id: "d5820c94-6f17-4a3b-8e05-9c14b7f602d3",
    title: "Deadlift 200 kg",
    category: "strength",
    priorityTier: "core",
    targetDate: "2026-03-14",
  },
];

const memory = [
  {
    id: "3b76a15e-9d40-4c28-b6f1-07e592c4a83b",
    memoryType: "profile_fact",
    content:
      "27 years old. Six years of consistent barbell training, two meets done. Trains in a proper powerlifting gym with a coach for technique but no programming.",
  },
  {
    id: "e04f8b23-1a67-4d95-8c30-b26e91f5a740",
    memoryType: "constraint",
    content:
      "Four gym days a week, no more — shift pattern will not allow a fifth. Heavy squat and heavy deadlift cannot land on consecutive days; the last time that happened the following week was a write-off.",
  },
  {
    id: "97c2d580-4e13-4b6a-9f28-30a15d7e6c94",
    memoryType: "preference",
    content:
      "Not interested in conditioning work, running, or classes. Has said this repeatedly. Walks for recovery and considers that sufficient.",
  },
  {
    id: "b61e0a35-8c47-4f92-a705-24d38b19e5f0",
    memoryType: "observed_pattern",
    content:
      "Grinds reps rather than stopping when bar speed drops. Responds well to being given an RPE ceiling and a hard rep target rather than 'work up to a heavy single'.",
  },
];

const trainingHistory = [
  session({
    id: "cc000001-0000-4000-8000-000000000001",
    actualLocalDate: daysAgo(2),
    timezoneName: "Europe/Berlin",
    durationMinutes: 95,
    perceivedEffort: 8,
    feeling: "as_expected",
    note: "Squat 5x3 at 160. Bar speed good on all sets.",
    activities: [{ id: ACTIVITY_ID, name: "Squat day", sport: "strength" }],
  }),
  session({
    id: "cc000002-0000-4000-8000-000000000002",
    actualLocalDate: daysAgo(4),
    timezoneName: "Europe/Berlin",
    durationMinutes: 80,
    perceivedEffort: 7,
    feeling: "as_expected",
    note: "Bench 4x5 at 105, close grip back-offs.",
    activities: [{ id: ACTIVITY_ID, name: "Bench day", sport: "strength" }],
  }),
  session({
    id: "cc000003-0000-4000-8000-000000000003",
    actualLocalDate: daysAgo(6),
    timezoneName: "Europe/Berlin",
    durationMinutes: 100,
    perceivedEffort: 9,
    feeling: "harder",
    severeFatigueReported: true,
    note: "Deadlift triples at 180. Last two were a grind, back was cooked afterwards.",
    activities: [{ id: ACTIVITY_ID, name: "Deadlift day", sport: "strength" }],
  }),
  session({
    id: "cc000004-0000-4000-8000-000000000004",
    actualLocalDate: daysAgo(9),
    timezoneName: "Europe/Berlin",
    durationMinutes: 75,
    perceivedEffort: 6,
    feeling: "easier",
    activities: [{ id: ACTIVITY_ID, name: "Upper accessory", sport: "strength" }],
  }),
  session({
    id: "cc000005-0000-4000-8000-000000000005",
    actualLocalDate: daysAgo(11),
    timezoneName: "Europe/Berlin",
    durationMinutes: 90,
    perceivedEffort: 8,
    feeling: "as_expected",
    activities: [{ id: ACTIVITY_ID, name: "Squat day", sport: "strength" }],
  }),
  session({
    id: "cc000006-0000-4000-8000-000000000006",
    actualLocalDate: daysAgo(13),
    timezoneName: "Europe/Berlin",
    durationMinutes: 85,
    perceivedEffort: 7,
    feeling: "as_expected",
    activities: [{ id: ACTIVITY_ID, name: "Bench day", sport: "strength" }],
  }),
];

const planningNote =
  "Ten weeks out from the meet. I want this week to be heavy — I know the deadlift last week beat me up but I would rather push now and deload later. Four days as usual.";

// --- probes ----------------------------------------------------------------

const WINDOW = planWindow(TODAY);
const HEAVY_LOWER = /\b(squat|deadlift)\b/i;

export const scenario = {
  name: "strength-athlete",
  title: "Powerlifter ten weeks out from a meet",
  purpose:
    "Tests the sport-agnostic invariant that no other scenario can reach. No endurance goals, no running, and a stated dislike of conditioning. A model that prescribes a recovery jog has assumed every athlete is a runner. Also tests structural scheduling — heavy squat and deadlift must not land on consecutive days — and whether a stated wish to 'push now' overrides a severe-fatigue signal from six days ago.",
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
      id: "noRunningPrescribed",
      label: "Prescribes no running or conditioning",
      mustPass: true,
      check: (sessions) => !WORDS.running.test(allPlanText(sessions)),
    },
    {
      id: "noSwimOrBike",
      label: "Prescribes no swimming or cycling",
      mustPass: true,
      check: (sessions) =>
        !WORDS.swimming.test(allPlanText(sessions)) &&
        !WORDS.cycling.test(allPlanText(sessions)),
    },
    {
      id: "fourDaysOrFewer",
      label: "Four gym days or fewer",
      mustPass: true,
      check: (sessions) => sessions.length <= 4,
    },
    {
      id: "heavyLowerSeparated",
      label: "Heavy squat and deadlift not on consecutive days",
      mustPass: true,
      check: (sessions) => {
        const heavy = sessions
          .filter((s) => HEAVY_LOWER.test(`${s.title} ${s.intent}`))
          .map((s) => WINDOW.indexOf(s.date))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b);
        return heavy.every((day, i) => i === 0 || day - heavy[i - 1] > 1);
      },
    },
    {
      id: "respectsFatigueSignal",
      label: "Acknowledges the severe-fatigue session",
      check: (sessions) =>
        /\b(fatigue|recover|beat up|cooked|back off|manage|grind|deload)\b/i.test(
          allPlanText(sessions),
        ),
    },
    {
      id: "usesRealGoals",
      label: "Every session serves a live goal",
      check: (sessions) =>
        sessions.every((s) => targetableGoals.some((g) => g.id === s.goalId)),
    },
  ],
  roadmapProbes: [
    {
      id: "noEnduranceBlocks",
      label: "No endurance or conditioning phase",
      mustPass: true,
      check: (parsed) =>
        !WORDS.running.test(allRoadmapText(parsed)) &&
        !WORDS.swimming.test(allRoadmapText(parsed)),
    },
    {
      id: "reachesTheMeet",
      label: "Covers the October meet date",
      check: (parsed) =>
        (parsed?.phases ?? []).some((p) => p.endDate >= "2026-10-17"),
    },
    {
      id: "hasAPeak",
      label: "Mentions a peak, taper, or deload",
      check: (parsed) =>
        /\b(peak|taper|deload|realis|realiz|prep|competition)\b/i.test(
          allRoadmapText(parsed),
        ),
    },
  ],
};
