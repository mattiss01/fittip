/**
 * Contract validation and scenario probes, shared by every path into the
 * bake-off: the API harness, the Codex handoff, and the ChatGPT worksheet.
 *
 * It lives in its own module so the paths cannot drift apart. A model scored
 * generously because it arrived through a different door is worse than no
 * comparison at all.
 *
 * Everything here is scenario-driven. An earlier version imported one corpus's
 * goal ids directly and hardcoded that athlete's planning-note checks, which
 * made a second scenario impossible to add without a rewrite — and would have
 * silently passed probes that meant nothing for the athlete being scored.
 */

import { OPERATIONS } from "./schemas.mjs";
import { planWindow } from "./scenarios/_shared.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything `src/server/ai/output-validation.ts` would reject, plus ownership. */
export function validate(operation, parsed, scenario) {
  const failures = [];
  const expected = OPERATIONS[operation]?.schemaVersion;
  const today = scenario.today;
  const window = planWindow(today);

  const targetableIds = new Set(
    scenario.context.targetableGoals.map((g) => g.id),
  );
  const historicalIds = new Set(
    scenario.context.historicalGoals.map((g) => g.id),
  );

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
    if (!targetableIds.has(item.goalId)) {
      failures.push(
        historicalIds.has(item.goalId)
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
      } else if (date < today) {
        failures.push(`${at} date ${date} is in the past`);
      }
    }
    if (operation === "create_seven_day_plan") {
      if (ISO_DATE.test(item.date ?? "") && !window.includes(item.date)) {
        failures.push(
          `${at} date ${item.date} is outside the seven-day window`,
        );
      }
      if (
        !Number.isInteger(item.durationMinutes) ||
        item.durationMinutes <= 0
      ) {
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

/**
 * Runs the scenario's own probes. Each returns
 * `{ id, label, mustPass, advisory, passed }`.
 *
 * A `mustPass` failure is a safety or hard-constraint finding, reported
 * separately from a preference miss — "proposed swimming to an athlete with an
 * active shoulder injury" and "did not include the long run they asked for" are
 * not the same class of wrong.
 *
 * An `advisory` probe still runs and is still reported, but never disqualifies
 * a model. Use it for a probe whose *finding* is worth seeing and whose
 * *verdict* is not trustworthy enough to decide anything — see the negation
 * problem documented in `scenarios/injury-active.mjs`. Advisory wins over
 * `mustPass`: a probe marked both is advisory.
 */
export function runProbes(operation, parsed, scenario) {
  if (!parsed) return null;

  const probes =
    operation === "create_roadmap"
      ? (scenario.roadmapProbes ?? [])
      : (scenario.planProbes ?? []);

  const subject =
    operation === "create_roadmap"
      ? parsed
      : Array.isArray(parsed.sessions)
        ? parsed.sessions
        : [];

  return probes.map((probe) => {
    let passed;
    try {
      passed = Boolean(probe.check(subject, scenario));
    } catch {
      // A probe that throws on malformed output is a failed probe, not a crash.
      passed = false;
    }
    const advisory = Boolean(probe.advisory);
    return {
      id: probe.id,
      label: probe.label,
      // Advisory suppresses mustPass rather than sitting beside it, so no
      // consumer has to remember to check both to avoid disqualifying a model.
      mustPass: !advisory && Boolean(probe.mustPass),
      advisory,
      passed,
    };
  });
}

/** Convenience summary used by every report. */
export function summarise(probeResults) {
  if (!probeResults) return null;
  const mustPass = probeResults.filter((p) => p.mustPass);
  return {
    total: probeResults.length,
    passed: probeResults.filter((p) => p.passed).length,
    mustPassTotal: mustPass.length,
    mustPassFailed: mustPass.filter((p) => !p.passed).map((p) => p.label),
    advisoryFailed: probeResults
      .filter((p) => p.advisory && !p.passed)
      .map((p) => p.label),
    softFailed: probeResults
      .filter((p) => !p.mustPass && !p.advisory && !p.passed)
      .map((p) => p.label),
  };
}

export { planWindow, weekdayOf } from "./scenarios/_shared.mjs";
