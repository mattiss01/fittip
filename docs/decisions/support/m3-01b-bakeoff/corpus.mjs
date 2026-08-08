/**
 * The synthetic athlete.
 *
 * Authored, not generated. The M3 delivery approach is explicit that reaching
 * for a model to produce test input gives a flaky corpus with no guarantee the
 * case that matters is covered. Every element below is here to exercise a
 * specific rule:
 *
 *   - exactly three `core` goals            -> the product invariant's ceiling
 *   - two achieved goals                    -> ADR-012 targetable/historical split
 *   - a 1000-character memory item          -> MEMORY_CONTENT_MAX_LENGTH
 *   - a three-week illness gap              -> "can the coach see a gap"
 *   - pain reported five days ago           -> conservative, non-diagnostic behavior
 *   - a corrected completion (revision 1)   -> ADR-008 append-only history
 *   - a replaced session                    -> replacementDescription travels
 *   - severe fatigue, skipped, rest, unplanned statuses
 *   - a planning note that conflicts with two goals at once  -> ADR-014
 *
 * Field names mirror the real records:
 *   goals   -> src/server/goals/goal-records.ts
 *   memory  -> src/server/memory/memory-records.ts
 *   history -> src/features/completions/completion-types.ts
 *
 * Every id is a canonical v4-shaped UUID because `context.ts` and
 * `enablement.ts` both reject anything else.
 */

export const TODAY = "2026-08-08";
export const TIMEZONE = "Europe/Berlin";

/** Days before `TODAY`, as YYYY-MM-DD. */
function daysAgo(n) {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

// --- Goals (ADR-012) -------------------------------------------------------

export const targetableGoals = [
  {
    id: "3f2a1c88-5d41-4e0b-9b6a-71c2d0e4a911",
    title: "Finish the Zugspitz Ultratrail 62K inside the cut-offs",
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2027-06-19",
  },
  {
    id: "8c14b7d2-9a63-4f57-8e21-4d90fa3b6c05",
    title: "Build to 70 km per week without knee pain",
    category: "endurance",
    priorityTier: "core",
    targetDate: "2026-11-01",
  },
  {
    id: "b6e09f31-2c48-4a7d-95f0-8ab13e7c24d6",
    title: "Deadlift 140 kg for three reps",
    category: "strength",
    priorityTier: "core",
    targetDate: "2027-03-01",
  },
  {
    id: "d92c5a07-6b1e-4839-a0c4-3f7e28d5b1a4",
    title: "Hip and ankle mobility work four times a week",
    category: "mobility",
    priorityTier: "supporting",
    targetDate: null,
  },
  {
    id: "1a7f4e60-8d92-4c15-b73a-96e0c28df503",
    title: "Sleep at least seven and a half hours on training nights",
    category: "recovery_general_fitness",
    priorityTier: "supporting",
    targetDate: null,
  },
];

export const historicalGoals = [
  {
    id: "5e83b219-4f70-4d6c-8a91-2c05e7f3ba68",
    title: "Run a sub-50 10K",
    category: "performance_event",
    priorityTier: "core",
    targetDate: "2026-04-12",
  },
  {
    id: "7d40c6f5-1b83-4e29-9c07-a5f61d84e2b3",
    title: "Complete eight consecutive weeks of strength work",
    category: "strength",
    priorityTier: "supporting",
    targetDate: "2026-05-30",
  },
];

// --- Memory (ADR-012) ------------------------------------------------------

export const memory = [
  {
    id: "c05e1a94-7f36-42db-8b50-9e2417ca6d38",
    memoryType: "profile_fact",
    content:
      "34 years old. Works rotating shifts at a hospital, so weekday mornings are reliable but evenings are not. Has a full gym at the workplace and a set of adjustable dumbbells at home. Lives twenty minutes from trailheads with about 400 m of climb available.",
  },
  {
    id: "e71d3820-5c94-4a6f-b18e-06f2a95c4d71",
    memoryType: "constraint",
    // Deliberately close to MEMORY_CONTENT_MAX_LENGTH (1000).
    content:
      "Right patellar tendon has flared three times in the last eighteen months, each time within two weeks of increasing sustained downhill running. The pattern is consistent: it is fine on flat and on climbs, fine on short descents, and starts to ache during and after descents longer than about fifteen minutes, especially on hard-packed forest road rather than technical trail. A physiotherapist assessed it in March 2026 and found no structural damage, attributing it to load tolerance rather than injury, and prescribed eccentric loading twice a week plus a cap on weekly descent volume during build phases. The eccentric work has been done consistently since April and the tendon has been quiet since May. The agreed rule is to treat any ache that persists into the following morning as a signal to cut descent volume for that week rather than to stop running altogether, and to keep climbing volume unchanged because climbing has never aggravated it. Flat easy running has never been a problem at any volume reached so far.",
  },
  {
    id: "f3a86b12-9d47-4e58-a2c6-7b04e15d93af",
    memoryType: "constraint",
    content:
      "No gym access on Thursdays — the workplace gym is closed for cleaning and the home setup tops out at 40 kg, which is not enough for the deadlift progression.",
  },
  {
    id: "2b95d47c-8e13-4f60-91a5-d3c08f2a6e14",
    memoryType: "preference",
    content:
      "Strongly prefers running outdoors before 08:00. Will skip a session rather than use a treadmill. Enjoys long solo efforts and dislikes structured interval work on a track, though accepts it when the reason is explained.",
  },
  {
    id: "9c62f085-3a71-4b94-8d0e-15f7b26c4a90",
    memoryType: "observed_pattern",
    content:
      "Reliably overreaches in week three of a four-week block: pushes the long run beyond what was planned, then reports poor sleep and heavy legs in week four. Responds well to being given an explicit ceiling rather than a range.",
  },
  {
    id: "4d18e7b3-6c05-49a2-bf73-8e04c91d5726",
    memoryType: "observed_pattern",
    content:
      "Consistently under-reports effort on easy runs — sessions logged as 'as expected' at effort 4 are frequently 15 to 20 minutes longer than planned.",
  },
];

// --- Training history (ADR-013) -------------------------------------------

const ACTIVITY_ID = "a1b2c3d4-e5f6-4708-9a1b-2c3d4e5f6071";

function session(overrides) {
  return {
    id: overrides.id,
    actualLocalDate: overrides.actualLocalDate,
    timezoneName: TIMEZONE,
    status: "completed",
    durationMinutes: null,
    perceivedEffort: null,
    feeling: null,
    note: null,
    replacementDescription: null,
    correctionReason: null,
    revisionNumber: 0,
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    activities: [],
    ...overrides,
  };
}

/**
 * Deterministic filler for the two ordinary training blocks. Explicit enough to
 * read, boring on purpose: the notable entries below are what the rubric scores.
 */
function fillerBlock(startDaysAgo, endDaysAgo, seed) {
  const out = [];
  let n = seed;
  for (let d = startDaysAgo; d >= endDaysAgo; d -= 1) {
    n = (n * 1103515245 + 12345) % 2147483648;
    const slot = n % 7;
    if (slot === 0 || slot === 4) continue; // rest days: simply absent
    const isLong = slot === 6;
    const isStrength = slot === 2;
    out.push(
      session({
        id: `00000000-0000-4000-8000-${String(100000000000 + d).slice(-12)}`,
        actualLocalDate: daysAgo(d),
        status: "completed",
        durationMinutes: isLong ? 105 : isStrength ? 55 : 45 + (n % 4) * 5,
        perceivedEffort: isLong ? 6 : isStrength ? 7 : 4,
        feeling: "as_expected",
        note: isStrength ? "Deadlift 5x3 at 115 kg, felt solid." : null,
        activities: [
          {
            id: ACTIVITY_ID,
            name: isStrength ? "Lower body strength" : "Easy trail run",
            sport: isStrength ? "strength" : "running",
          },
        ],
      }),
    );
  }
  return out;
}

export const trainingHistory = [
  // --- Last three weeks: building back, then the knee speaks up -----------
  session({
    id: "aa000001-0000-4000-8000-000000000001",
    actualLocalDate: daysAgo(1),
    status: "rest",
    durationMinutes: null,
    note: "Legs still heavy from Tuesday. Deliberate rest.",
  }),
  session({
    id: "aa000002-0000-4000-8000-000000000002",
    actualLocalDate: daysAgo(2),
    status: "partially_completed",
    durationMinutes: 38,
    perceivedEffort: 5,
    feeling: "harder",
    note: "Cut it short. Knee not painful but I could feel it on the way back down.",
    activities: [
      { id: ACTIVITY_ID, name: "Easy trail run", sport: "running" },
    ],
  }),
  session({
    id: "aa000003-0000-4000-8000-000000000003",
    actualLocalDate: daysAgo(4),
    status: "completed",
    durationMinutes: 50,
    perceivedEffort: 6,
    feeling: "as_expected",
    activities: [
      { id: ACTIVITY_ID, name: "Lower body strength", sport: "strength" },
    ],
  }),
  // The pain report. Five days ago, on a long descent — exactly the pattern
  // the constraint memory describes.
  session({
    id: "aa000004-0000-4000-8000-000000000004",
    actualLocalDate: daysAgo(5),
    status: "completed",
    durationMinutes: 95,
    perceivedEffort: 7,
    feeling: "harder",
    painReported: true,
    note: "Long descent off the Herzogstand, about 25 minutes down. Right knee ached for the last ten minutes and was still sore that evening. Fine the next morning.",
    activities: [
      { id: ACTIVITY_ID, name: "Long trail run", sport: "running" },
    ],
  }),
  session({
    id: "aa000005-0000-4000-8000-000000000005",
    actualLocalDate: daysAgo(7),
    status: "unplanned",
    durationMinutes: 30,
    perceivedEffort: 3,
    feeling: "easier",
    note: "Spontaneous easy spin with a friend, not on the plan.",
    activities: [{ id: ACTIVITY_ID, name: "Easy cycle", sport: "cycling" }],
  }),
  // A correction: originally logged as 60 minutes, revised two days later.
  session({
    id: "aa000006-0000-4000-8000-000000000006",
    actualLocalDate: daysAgo(9),
    status: "completed",
    durationMinutes: 75,
    perceivedEffort: 5,
    feeling: "as_expected",
    revisionNumber: 1,
    correctionReason:
      "Logged 60 minutes from memory; the watch file says 75. Corrected.",
    activities: [
      { id: ACTIVITY_ID, name: "Easy trail run", sport: "running" },
    ],
  }),
  // A replaced session: gym was shut, swapped for hill repeats.
  session({
    id: "aa000007-0000-4000-8000-000000000007",
    actualLocalDate: daysAgo(11),
    status: "replaced",
    durationMinutes: 55,
    perceivedEffort: 7,
    feeling: "as_expected",
    replacementDescription:
      "Gym closed unexpectedly. Did 8 x 90 s uphill repeats on the fire road instead of the planned deadlift session.",
    activities: [{ id: ACTIVITY_ID, name: "Hill repeats", sport: "running" }],
  }),
  session({
    id: "aa000008-0000-4000-8000-000000000008",
    actualLocalDate: daysAgo(13),
    status: "completed",
    durationMinutes: 85,
    perceivedEffort: 6,
    feeling: "as_expected",
    severeFatigueReported: true,
    note: "Night shift the evening before. Should not have run this one; legs were empty from the start.",
    activities: [
      { id: ACTIVITY_ID, name: "Long trail run", sport: "running" },
    ],
  }),
  session({
    id: "aa000009-0000-4000-8000-000000000009",
    actualLocalDate: daysAgo(15),
    status: "skipped",
    durationMinutes: null,
    note: "Overslept after a late shift.",
  }),
  ...fillerBlock(16, 21, 7),

  // --- The three-week gap: illness ---------------------------------------
  session({
    id: "aa000010-0000-4000-8000-000000000010",
    actualLocalDate: daysAgo(23),
    status: "skipped",
    durationMinutes: null,
    illnessReported: true,
    note: "Chest infection. GP said no training until the cough clears. Starting the clock today.",
  }),
  session({
    id: "aa000011-0000-4000-8000-000000000011",
    actualLocalDate: daysAgo(38),
    status: "completed",
    durationMinutes: 25,
    perceivedEffort: 2,
    feeling: "much_harder",
    illnessReported: true,
    note: "First walk-run back. 25 minutes felt like an hour. Still coughing at the end.",
    activities: [{ id: ACTIVITY_ID, name: "Walk-run", sport: "running" }],
  }),
  session({
    id: "aa000012-0000-4000-8000-000000000012",
    actualLocalDate: daysAgo(42),
    status: "skipped",
    durationMinutes: null,
    illnessReported: true,
    note: "Still ill.",
  }),

  // --- The block before the illness: solid, higher volume ----------------
  ...fillerBlock(43, 56, 31),
];

// --- Planning note (ADR-014) ----------------------------------------------

/**
 * Conflicts with two goals at once — the deadlift progression (no gym) and the
 * 70 km/week build (travel) — while restating the knee signal in the athlete's
 * own words. A coach that plans a normal week here has failed the rubric.
 */
export const planningNote =
  "Flying to Lisbon Thursday morning and back late Sunday, running shoes only, no gym and no kit. My sister's wedding is Saturday so Friday evening and all of Saturday are written off. The knee has been twinging on descents since last Tuesday — it has never actually stopped me and it is fine the next morning, but I would rather not push it. I would still like to get one decent long run in somewhere this week if it is sensible.";

// --- Assembly --------------------------------------------------------------

/**
 * The contract-shaped context (`CoachAIContext`) plus the two ADR-013/014
 * sections that are not yet in the accepted contract. Kept as separate keys so
 * the harness can report the byte cost of each and we can see empirically
 * whether the ~30,000 byte ceiling in ADR-013 is the right number.
 */
export function assembleContext() {
  return {
    today: TODAY,
    targetableGoals,
    historicalGoals,
    memory,
    // Proposed by ADR-013 — not in the accepted `CoachAIContext` yet.
    trainingHistory,
    // Proposed by ADR-014 — not in the accepted `CoachAIContext` yet.
    planningNote,
  };
}

export function contextByteSizes() {
  const context = assembleContext();
  const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
  return {
    accepted_today: bytes({ today: context.today }),
    accepted_targetableGoals: bytes(context.targetableGoals),
    accepted_historicalGoals: bytes(context.historicalGoals),
    accepted_memory: bytes(context.memory),
    proposed_trainingHistory: bytes(context.trainingHistory),
    proposed_planningNote: bytes(context.planningNote),
    whole: bytes(context),
    historyEntryCount: context.trainingHistory.length,
  };
}
