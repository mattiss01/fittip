/**
 * Contract validation and safety probes, shared by every path into the
 * bake-off: the API harness (`run.mjs`), the Codex handoff, and hand-pasted
 * ChatGPT output (`score.mjs`).
 *
 * It lives in its own module so the three paths cannot drift apart. A model
 * scored generously because it arrived through a different door is worse than
 * no comparison at all.
 */

import { OPERATIONS } from "./schemas.mjs";
import { TODAY, targetableGoals, historicalGoals } from "./corpus.mjs";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function addDays(iso, n) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(iso) {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** The seven days a plan request covers: tomorrow through tomorrow+6. */
export const PLAN_WINDOW = Array.from({ length: 7 }, (_, i) =>
  addDays(TODAY, i + 1),
);

const TARGETABLE_IDS = new Set(targetableGoals.map((g) => g.id));
const HISTORICAL_IDS = new Set(historicalGoals.map((g) => g.id));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything `src/server/ai/output-validation.ts` would reject, plus ownership. */
export function validate(operation, parsed) {
  const failures = [];
  const expected = OPERATIONS[operation]?.schemaVersion;

  if (parsed?.schemaVersion !== expected) {
    failures.push(
      `schemaVersion is ${JSON.stringify(parsed?.schemaVersion)}, expected ${expected}`,
    );
  }

  const items =
    operation === "create_roadmap" ? parsed?.phases : parsed?.sessions;
  if (!Array.isArray(items) || items.length === 0) {
    failures.push("no phases/sessions returned");
    return failures;
  }

  for (const [index, item] of items.entries()) {
    const at = `[${index}]`;
    if (!TARGETABLE_IDS.has(item.goalId)) {
      failures.push(
        HISTORICAL_IDS.has(item.goalId)
          ? `${at} references an ACHIEVED goal — ${item.goalId}`
          : `${at} references an unknown goalId — ${item.goalId}`,
      );
    }
    const dates =
      operation === "create_roadmap"
        ? [item.startDate, item.endDate]
        : [item.date];
    for (const date of dates) {
      if (!ISO_DATE.test(date ?? "")) {
        failures.push(`${at} malformed date ${JSON.stringify(date)}`);
      } else if (date < TODAY) {
        failures.push(`${at} date ${date} is in the past`);
      }
    }
    if (operation === "create_seven_day_plan") {
      if (ISO_DATE.test(item.date ?? "") && !PLAN_WINDOW.includes(item.date)) {
        failures.push(`${at} date ${item.date} is outside the seven-day window`);
      }
      if (!Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0) {
        failures.push(`${at} durationMinutes is ${item.durationMinutes}`);
      }
    }
  }

  if (operation === "create_roadmap") {
    const sorted = [...items].sort((a, b) =>
      String(a.startDate).localeCompare(String(b.startDate)),
    );
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startDate <= sorted[i - 1].endDate) {
        failures.push(
          `phases overlap: "${sorted[i - 1].title}" ends ${sorted[i - 1].endDate}, "${sorted[i].title}" starts ${sorted[i].startDate}`,
        );
      }
    }
  }

  return failures;
}

const GYM_WORDS =
  /\b(gym|deadlift|barbell|squat rack|bench press|weights room|leg press)\b/i;
const PAIN_WORDS =
  /\b(knee|patellar|tendon|descent|downhill|niggle|twinge)\b/i;
const BUILD_BACK_WORDS =
  /\b(gradual|build back|easing|return|after the (illness|break|gap)|conservativ)\b/i;

/**
 * The planning note says: fly Thursday, back late Sunday, no gym, wedding
 * Saturday, knee twinging on descents, still wants one long run.
 *
 * Each probe is a mechanical yes/no. A model can pass all of them and still
 * produce a bad plan — these narrow what a human has to read, they do not
 * replace reading it.
 */
export function probePlan(parsed) {
  const sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  const text = (s) => `${s.title ?? ""} ${s.intent ?? ""}`;
  const all = sessions.map(text).join(" ") + " ";

  const thursday = PLAN_WINDOW.find((d) => weekdayOf(d) === "Thursday");
  const saturday = PLAN_WINDOW.find((d) => weekdayOf(d) === "Saturday");
  // "Flying Thursday, back late Sunday" — with this window the return Sunday
  // falls outside it, so travel runs Thursday to the window's end. Do not
  // anchor the end on the first Sunday found: that is the window's opening day.
  const travelDays = thursday ? PLAN_WINDOW.filter((d) => d >= thursday) : [];
  const onTravel = sessions.filter((s) => travelDays.includes(s.date));

  return {
    windowStart: PLAN_WINDOW[0],
    windowEnd: PLAN_WINDOW[6],
    travelDays,
    sessionCount: sessions.length,
    totalMinutes: sessions.reduce(
      (sum, s) => sum + (Number(s.durationMinutes) || 0),
      0,
    ),
    noGymWhileTravelling: !onTravel.some((s) => GYM_WORDS.test(text(s))),
    weddingDayLeftEmpty: !sessions.some((s) => s.date === saturday),
    hasLongRun: sessions.some((s) => Number(s.durationMinutes) >= 75),
    acknowledgesKnee: PAIN_WORDS.test(all),
    acknowledgesReturn: BUILD_BACK_WORDS.test(all),
    restDays: 7 - new Set(sessions.map((s) => s.date)).size,
  };
}

export function probeRoadmap(parsed) {
  const phases = Array.isArray(parsed?.phases) ? parsed.phases : [];
  const all =
    `${parsed?.summary ?? ""} ` +
    phases.map((p) => `${p.title} ${p.focus}`).join(" ");
  return {
    phaseCount: phases.length,
    coversUltraGoal: phases.some((p) => p.goalId === targetableGoals[0].id),
    mentionsKneeConstraint: PAIN_WORDS.test(all),
    summaryChars: (parsed?.summary ?? "").length,
  };
}

export function probe(operation, parsed) {
  if (!parsed) return null;
  return operation === "create_roadmap"
    ? probeRoadmap(parsed)
    : probePlan(parsed);
}
