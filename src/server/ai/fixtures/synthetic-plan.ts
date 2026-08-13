import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIContext,
  type CoachAIGoalReference,
} from "@/server/ai/contracts";
import { normalizeOwnerText } from "@/server/ai/owner-text";

/**
 * A deterministic plan built from the request's own context.
 *
 * The same job `synthesizeRoadmapBody` does, for the same reason: every body in
 * the authored corpus is a literal with fixed dates and fixed goal ids, so a
 * real owner rejects all of them. A network-free run that has to produce
 * something *reviewable* — the founder exercising compose, review and reject on
 * a Preview without spending anything — needs a body derived from the context
 * it was given.
 *
 * This is not a model and does not pretend to be one. It is the smallest
 * structurally valid plan for a given horizon and goal set. It says nothing
 * about whether a real coach would propose anything like it.
 *
 * It reaches no network and reads no clock: same context, same bytes.
 */

const DAY_MS = 86_400_000;
const MAX_SECONDARY_GOALS = 3;
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const SPORTS = [
  ["swim", "Swimming"],
  ["run", "Running"],
  ["cycl", "Cycling"],
  ["bike", "Cycling"],
  ["strength", "Strength"],
  ["yoga", "Yoga"],
  ["walk", "Walking"],
] as const;

export function synthesizePlanBody(context: CoachAIContext): string {
  const dates = horizonDates(context);
  const goals = context.targetableGoals;
  const primary = goals[0];
  const fixtureInput = fixturePlanInput(context);
  const { constraints, preferences } = fixtureInput;
  const hasAppliedLimitation = fixtureInput.hasRecognizedAcceptedConstraint;

  // Every second day carries a session, so a horizon of two days or more shows
  // both a training day and an explicit rest day — which is the thing the
  // surface most needs to be reviewable.
  const eligibleDates = dates.filter((date) => isAvailable(date, constraints));
  const sessionDates = eligibleDates.filter((_date, index) => index % 2 === 0);
  const sport = constrainedSport(primary, constraints, preferences);

  const sessions = sessionDates.map((date, index) => ({
    date,
    title: hasAppliedLimitation
      ? index === 0
        ? `Constraint-aware ${sport.toLowerCase()} session`
        : `Supporting ${sport.toLowerCase()} session`
      : index === 0
        ? "Easy aerobic session"
        : "Steadier session",
    sport,
    focus: bound(
      hasAppliedLimitation
        ? "Gentle work outside the accepted limitation."
        : index === 0
          ? "Repeatable easy work you could do again tomorrow."
          : "A little more effort, still well short of a hard day.",
      300,
    ),
    intent: bound(
      hasAppliedLimitation
        ? `${constraints.timeWindow ? `Schedule this ${constraints.timeWindow}. ` : ""}Stop if this conflicts with the accepted limitation; otherwise keep it comfortable.`
        : index === 0
          ? "Conversational the whole way. Finish feeling you could go again."
          : "Comfortably hard in the middle, easy either side of it.",
      300,
    ),
    durationMinutes: constrainedMinutes(
      index === 0 ? 45 : 50,
      date,
      constraints,
    ),
    primaryGoalId: primary?.id ?? "",
    secondaryGoalIds: goals.slice(1, 1 + MAX_SECONDARY_GOALS).map((g) => g.id),
    alternatives:
      index === 0
        ? [
            {
              title: bound("A shorter version of the same session", 120),
              whenToChoose: bound(
                "If the time you have on the day turns out to be shorter.",
                200,
              ),
            },
          ]
        : null,
    rationale: bound(
      fixtureInput.hasAppliedScheduling
        ? `${rationaleFor(primary, context)} Available planning inputs shape the scheduling details used here.`
        : rationaleFor(primary, context),
      300,
    ),
  }));

  const plan = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    weekDescription: bound(weekDescription(context, sessions.length), 600),
    startDate: context.horizonStartDate,
    endDate: context.horizonEndDate,
    sessions,
    assumptions: [
      bound(
        "Your recent training is representative of what you can sustain.",
        200,
      ),
      ...fixtureInput.appliedAcceptedMemory
        .slice(0, 3)
        .map((item) =>
          bound(`Applied accepted ${item.type}: ${item.content}`, 200),
        ),
    ],
    uncertainties: fixtureInput.unrecognizedAcceptedMemory
      .slice(0, 3)
      .map((item) => ({
        statement: bound(
          `Accepted ${item.type} needs review: ${item.content}`,
          200,
        ),
        whyItMatters:
          "The fixture could not apply that wording without guessing what it changes.",
        whatToWatch:
          "Review the proposed dates, duration, setting and sport against it.",
      })),
    // An eligible reported signal is resolved by the surface before this
    // fixture is invoked: without accepted severity its tier is uncertain and
    // generation pauses. An accepted ordinary limitation instead leaves out
    // conflicting work while the rest of the horizon continues.
    safetyConsiderations: fixtureInput.hasAcceptedConstraint
      ? [
          bound(
            hasAppliedLimitation
              ? "Accepted constraints are active. Only affected activities, dates, durations or settings are left out; non-conflicting sessions continue."
              : "An accepted constraint is active, but this fixture could not apply its wording without guessing. Review the proposal against it before continuing.",
            240,
          ),
        ]
      : null,
  };

  return JSON.stringify({ plan, memoryCandidates: memoryCandidates(context) });
}

type FixtureConstraints = {
  maxMinutes: number | null;
  weekdayMaxMinutes: number | null;
  weekendMaxMinutes: number | null;
  allowedWeekdays: Set<number> | null;
  unavailableWeekdays: Set<number>;
  blockedSports: Set<string>;
  comfortableSports: string[];
  setting: "home" | "indoors" | "outdoors" | null;
  timeWindow: string | null;
  equipmentFree: boolean;
};

type FixturePreferences = {
  preferredSports: string[];
};

type FixturePlanInput = {
  constraints: FixtureConstraints;
  preferences: FixturePreferences;
  appliedAcceptedMemory: {
    type: "constraint" | "preference";
    content: string;
  }[];
  unrecognizedAcceptedMemory: {
    type: "constraint" | "preference";
    content: string;
  }[];
  hasAcceptedConstraint: boolean;
  hasRecognizedAcceptedConstraint: boolean;
  hasAppliedScheduling: boolean;
};

function fixturePlanInput(context: CoachAIContext): FixturePlanInput {
  const acceptedConstraints = context.memory.filter(
    (item) => item.memoryType === "constraint",
  );
  const acceptedPreferences = context.memory.filter(
    (item) => item.memoryType === "preference",
  );
  const parsedAccepted = acceptedConstraints.map((item) => ({
    item,
    parsed: parseConstraints([item.content]),
  }));
  const parsedNote = parseConstraints(
    context.planningNote === null ? [] : [context.planningNote],
  );
  const parsedPreferences = acceptedPreferences.map((item) => ({
    item,
    sports: preferredSports(item.content),
  }));
  const accepted = mergeConstraints(
    parsedAccepted.map(({ parsed }) => parsed.constraints),
  );
  const constraints = mergeConstraints([accepted, parsedNote.constraints]);
  const preferences = {
    preferredSports: parsedPreferences.flatMap(({ sports }) => sports),
  };

  return {
    constraints,
    preferences,
    appliedAcceptedMemory: [
      ...parsedAccepted
        .filter(({ parsed }) => parsed.recognized)
        .map(({ item }) => ({
          type: "constraint" as const,
          content: item.content,
        })),
      ...parsedPreferences
        .filter(({ sports }) => sports.length > 0)
        .map(({ item }) => ({
          type: "preference" as const,
          content: item.content,
        })),
    ],
    unrecognizedAcceptedMemory: [
      ...parsedAccepted
        .filter(({ parsed }) => !parsed.recognized)
        .map(({ item }) => ({
          type: "constraint" as const,
          content: item.content,
        })),
      ...parsedPreferences
        .filter(({ sports }) => sports.length === 0)
        .map(({ item }) => ({
          type: "preference" as const,
          content: item.content,
        })),
    ],
    hasAcceptedConstraint: acceptedConstraints.length > 0,
    hasRecognizedAcceptedConstraint: parsedAccepted.some(
      ({ parsed }) => parsed.recognized,
    ),
    hasAppliedScheduling:
      parsedAccepted.some(({ parsed }) => parsed.recognized) ||
      parsedNote.recognized ||
      preferences.preferredSports.length > 0,
  };
}

function parseConstraints(contents: string[]): {
  constraints: FixtureConstraints;
  recognized: boolean;
} {
  const text = contents.join(" ").toLowerCase();
  const minuteMatches = [
    ...text.matchAll(
      /(?:only have|at most|maximum|max|up to)\s+(\d{1,7})\s+minutes?\b(?:\s+on\s+(weekdays?|weekends?))?/g,
    ),
  ]
    .map((match) => ({
      value: Number(match[1]),
      days: match[2] ?? null,
    }))
    .filter(({ value }) => Number.isSafeInteger(value) && value > 0);
  const minimumFor = (days: string | null) => {
    const values = minuteMatches
      .filter((match) => match.days === days)
      .map((match) => match.value);
    return values.length > 0 ? Math.min(...values) : null;
  };
  const allowedWeekdays = allowedDays(text);
  const unavailableWeekdays = new Set<number>();
  for (const [index, day] of WEEKDAYS.entries()) {
    if (
      new RegExp(
        `(?:no|never|unavailable|cannot|can't|do not|don't)(?:\\s+\\w+){0,4}\\s+(?:on\\s+)?${day}s?\\b`,
        "i",
      ).test(text)
    ) {
      unavailableWeekdays.add(index);
    }
  }

  const blockedSports = new Set<string>();
  const comfortableSports: string[] = [];
  for (const [needle, sport] of SPORTS) {
    if (
      new RegExp(
        `(?:no|avoid|cannot|can't|do not|don't)\\s+(?:go\\s+)?${needle}\\w*`,
        "i",
      ).test(text)
    ) {
      blockedSports.add(sport);
    }
    if (
      new RegExp(
        `${needle}\\w*\\s+(?:is|feels?)\\s+(?:comfortable|okay|fine)`,
        "i",
      ).test(text)
    ) {
      comfortableSports.push(sport);
    }
  }
  const equipmentFree =
    /\b(?:no (?:gym|equipment|weights)|without equipment)\b/i.test(text);
  if (equipmentFree) blockedSports.add("Strength");
  if (/\bno pool\b/i.test(text)) blockedSports.add("Swimming");
  if (/\bno (?:bike|bicycle)\b/i.test(text)) blockedSports.add("Cycling");

  const setting = /\b(?:at home|home only)\b/i.test(text)
    ? "home"
    : /\bindoor(?:s)? only\b/i.test(text)
      ? "indoors"
      : /\boutdoor(?:s)? only\b/i.test(text)
        ? "outdoors"
        : null;
  const timeWindow =
    text.match(
      /\b(before work|after work|in the morning|in the evening|at lunch(?:time)?)\b/i,
    )?.[1] ?? null;
  const constraints: FixtureConstraints = {
    maxMinutes: minimumFor(null),
    weekdayMaxMinutes: minimumFor("weekday") ?? minimumFor("weekdays"),
    weekendMaxMinutes: minimumFor("weekend") ?? minimumFor("weekends"),
    allowedWeekdays,
    unavailableWeekdays,
    blockedSports,
    comfortableSports,
    setting,
    timeWindow,
    equipmentFree,
  };
  return {
    constraints,
    recognized:
      minuteMatches.length > 0 ||
      allowedWeekdays !== null ||
      unavailableWeekdays.size > 0 ||
      blockedSports.size > 0 ||
      comfortableSports.length > 0 ||
      setting !== null ||
      timeWindow !== null ||
      equipmentFree,
  };
}

function mergeConstraints(items: FixtureConstraints[]): FixtureConstraints {
  const allowed = items
    .map((item) => item.allowedWeekdays)
    .filter((item): item is Set<number> => item !== null);
  return {
    maxMinutes: minimum(items.map((item) => item.maxMinutes)),
    weekdayMaxMinutes: minimum(items.map((item) => item.weekdayMaxMinutes)),
    weekendMaxMinutes: minimum(items.map((item) => item.weekendMaxMinutes)),
    allowedWeekdays:
      allowed.length === 0
        ? null
        : new Set(
            [...allowed[0]].filter((day) =>
              allowed.every((days) => days.has(day)),
            ),
          ),
    unavailableWeekdays: new Set(
      items.flatMap((item) => [...item.unavailableWeekdays]),
    ),
    blockedSports: new Set(items.flatMap((item) => [...item.blockedSports])),
    comfortableSports: items.flatMap((item) => item.comfortableSports),
    setting: items.find((item) => item.setting !== null)?.setting ?? null,
    timeWindow:
      items.find((item) => item.timeWindow !== null)?.timeWindow ?? null,
    equipmentFree: items.some((item) => item.equipmentFree),
  };
}

function minimum(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.min(...present) : null;
}

function preferredSports(text: string): string[] {
  return SPORTS.filter(([needle]) =>
    new RegExp(
      `\\bprefer(?:s|red)?\\s+(?:to\\s+)?(?:go\\s+)?${needle}\\w*`,
      "i",
    ).test(text),
  ).map(([, sport]) => sport);
}

function allowedDays(text: string): Set<number> | null {
  if (
    /\bweekdays? only\b|\bonly (?:train|available) on weekdays?\b/i.test(text)
  ) {
    return new Set([1, 2, 3, 4, 5]);
  }
  if (
    /\bweekends? only\b|\bonly (?:train|available) on weekends?\b/i.test(text)
  ) {
    return new Set([0, 6]);
  }
  const match = text.match(
    /\b(?:only train|available only|only available)(?:\s+on)?\s+([^.]*)/i,
  );
  if (!match) return null;
  const days = new Set<number>();
  for (const [index, day] of WEEKDAYS.entries()) {
    if (new RegExp(`\\b${day}s?\\b`, "i").test(match[1] ?? "")) days.add(index);
  }
  return days.size > 0 ? days : null;
}

function isAvailable(date: string, constraints: FixtureConstraints): boolean {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return (
    !constraints.unavailableWeekdays.has(weekday) &&
    (constraints.allowedWeekdays === null ||
      constraints.allowedWeekdays.has(weekday))
  );
}

function constrainedMinutes(
  proposed: number,
  date: string,
  constraints: FixtureConstraints,
): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const dayLimit =
    weekday === 0 || weekday === 6
      ? constraints.weekendMaxMinutes
      : constraints.weekdayMaxMinutes;
  const limit = minimum([constraints.maxMinutes, dayLimit]);
  return limit === null ? proposed : Math.min(proposed, limit);
}

function constrainedSport(
  goal: CoachAIGoalReference | undefined,
  constraints: FixtureConstraints,
  preferences: FixturePreferences,
): string {
  if (constraints.setting === "home") return "Home mobility";
  if (constraints.setting === "indoors") return "Indoor mobility";
  if (constraints.setting === "outdoors") return "Walking";

  const goalSport = sportFor(goal);
  const candidates = [
    ...preferences.preferredSports,
    ...constraints.comfortableSports,
    goalSport,
    constraints.equipmentFree ? "Walking" : "Mobility",
    "Walking",
  ];
  return (
    candidates.find((candidate) => !constraints.blockedSports.has(candidate)) ??
    "Mobility"
  );
}

/**
 * At most one candidate, quoting the note's first sentence exactly. Quoting
 * rather than summarizing is the point: the excerpt must survive the substring
 * check in both the validator and `record_plan_memory_candidates`.
 */
function memoryCandidates(
  context: CoachAIContext,
): { memoryType: string; sourceExcerpt: string; confidence: number | null }[] {
  if (context.planningNote === null) return [];
  const note = normalizeOwnerText(context.planningNote);
  const firstSentence = note.split(/(?<=\.)\s+/)[0] ?? note;
  const excerpt = firstSentence.slice(0, 200).trim();
  if (excerpt.length === 0 || !note.includes(excerpt)) return [];

  return [{ memoryType: "constraint", sourceExcerpt: excerpt, confidence: 50 }];
}

function horizonDates(context: CoachAIContext): string[] {
  const startMs = Date.parse(`${context.horizonStartDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${context.horizonEndDate}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

function sportFor(goal: CoachAIGoalReference | undefined): string {
  if (!goal) return "General training";
  const haystack = `${goal.title} ${goal.category}`.toLowerCase();
  return (
    SPORTS.find(([needle]) => haystack.includes(needle))?.[1] ??
    bound(goal.category.replace(/_/g, " "), 60)
  );
}

function rationaleFor(
  goal: CoachAIGoalReference | undefined,
  context: CoachAIContext,
): string {
  const base = goal
    ? `Most of this horizon stays easy so the work toward ${goal.title} is repeatable.`
    : "Without a dated objective this stays deliberately general.";
  return context.trainingHistory.sessionsIncluded === 0
    ? `${base} There is no recent training on record, so it starts conservatively.`
    : base;
}

function weekDescription(
  context: CoachAIContext,
  sessionCount: number,
): string {
  const dayCount =
    Math.round(
      (Date.parse(`${context.horizonEndDate}T00:00:00.000Z`) -
        Date.parse(`${context.horizonStartDate}T00:00:00.000Z`)) /
        DAY_MS,
    ) + 1;
  const goalCount = context.targetableGoals.length;
  const parts = [
    `This covers ${context.horizonStartDate} to ${context.horizonEndDate}: ${dayCount} day${dayCount === 1 ? "" : "s"} with ${sessionCount} session${sessionCount === 1 ? "" : "s"} in it.`,
    goalCount === 0
      ? "You have no active goals yet, so it holds a general base."
      : `It works across your ${goalCount} active goal${goalCount === 1 ? "" : "s"}, keeping most of the load easy.`,
    "The days without a session are rest, and they are planned rather than left over.",
  ];
  return parts.join(" ");
}

function bound(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}.`;
}
