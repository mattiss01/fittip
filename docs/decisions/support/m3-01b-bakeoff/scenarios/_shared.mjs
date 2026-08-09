/**
 * Helpers shared by every scenario.
 *
 * A scenario is a synthetic athlete plus the mechanical checks that say whether
 * a proposal respected that athlete's situation. Keeping the checks *with* the
 * athlete is the point: "no gym while travelling" means nothing to a scenario
 * with no travel, and a probe list that drifts from its context is a probe list
 * that silently passes everything.
 */

export const COMPLETION_DEFAULTS = {
  timezoneName: "Europe/Berlin",
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
};

export function session(overrides) {
  return { ...COMPLETION_DEFAULTS, ...overrides };
}

/** Days before `today`, as YYYY-MM-DD. */
export function daysBefore(today, n) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

export function daysAfter(today, n) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayOf(iso) {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** The seven days a plan request covers: tomorrow through tomorrow+6. */
export function planWindow(today) {
  return Array.from({ length: 7 }, (_, i) => daysAfter(today, i + 1));
}

export const sessionText = (s) => `${s.title ?? ""} ${s.intent ?? ""}`;

export const allPlanText = (sessions) =>
  sessions.map(sessionText).join(" ") + " ";

export const allRoadmapText = (parsed) =>
  `${parsed?.summary ?? ""} ` +
  (parsed?.phases ?? []).map((p) => `${p.title} ${p.focus}`).join(" ");

// Vocabulary shared across scenarios. Each is deliberately narrow: a probe that
// matches too much reports success it did not observe.
export const WORDS = {
  gym: /\b(gym|deadlift|barbell|squat rack|bench press|weights room|leg press|machine)\b/i,
  running:
    /\b(run|running|jog|tempo run|intervals on the track|fartlek|long run|shakeout)\b/i,
  descent: /\b(descent|downhill|descend|down\s?hill)\b/i,
  knee: /\b(knee|patellar|tendon|niggle|twinge)\b/i,
  buildBack:
    /\b(gradual|build back|building back|eas(e|ing) back|return|conservativ|rebuild)\b/i,
  professional:
    /\b(physio|physiotherapist|clinician|doctor|gp|medical|professional|specialist)\b/i,
  diagnosis:
    /\b(tendinitis|tendinopathy|tendonitis|strain|tear|sprain|itbs|it band syndrome|runner's knee|chondromalacia|plantar fasciitis|stress fracture|diagnos)\b/i,
  swimming: /\b(swim|swimming|pool)\b/i,
  cycling: /\b(cycl|bike|biking|spin|turbo)\b/i,
};

/**
 * Every probe is `{ id, label, check }` where `check` returns true when the
 * proposal did the right thing. `mustPass` marks a probe whose failure is a
 * safety finding rather than a preference — those are reported separately.
 */
export function probeSet(probes) {
  return probes;
}
