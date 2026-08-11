import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIContext,
  type CoachAIGoalReference,
} from "@/server/ai/contracts";
import { normalizeOwnerText } from "@/server/ai/owner-text";

/**
 * A deterministic roadmap built from the request's own context.
 *
 * The authored corpus in `fixture-corpus.ts` cannot do this job. Every body
 * there is a literal with fixed dates and fixed goal ids, which is exactly what
 * makes it a useful checklist and exactly what makes it useless against a real
 * owner: a real horizon and real goal ids reject every one of them. So a
 * network-free run that has to produce something *reviewable* — the founder
 * exercising the whole compose, review, edit, decline, regenerate and accept
 * path on a Preview without spending anything — needs a body derived from the
 * context it was given.
 *
 * This is not a model and does not pretend to be one. It is the smallest
 * structurally valid roadmap for a given horizon and goal set: it makes the
 * surface demonstrable and the flow testable, and it says nothing about whether
 * a real coach would propose anything like it. The single live validation pass
 * is what answers that.
 *
 * It reaches no network and reads no clock: same context, same bytes.
 */

const MAX_ATTENTION_PER_PHASE = 4;
const MAX_PHASES = 6;
const DAY_MS = 86_400_000;

export function synthesizeRoadmapBody(context: CoachAIContext): string {
  const start = context.horizonStartDate;
  const end = context.horizonEndDate;
  const goals = context.targetableGoals;

  // Every core goal must appear in at least one phase, and a phase carries at
  // most four attention entries, so the goal set decides the minimum phase
  // count before the calendar does.
  const groups = chunk(goals, MAX_ATTENTION_PER_PHASE);
  const phaseCount = Math.min(
    MAX_PHASES,
    Math.max(groups.length === 0 ? 1 : groups.length, 2),
  );
  const boundaries = splitHorizon(start, end, phaseCount);

  const phases = boundaries.map((boundary, index) => {
    const attention = groups[index] ?? groups[groups.length - 1] ?? [];
    return {
      title: phaseTitle(index, boundaries.length),
      focus: phaseFocus(index, boundaries.length, context),
      startDate: boundary.startDate,
      endDate: boundary.endDate,
      goalAttention:
        attention.length > 0
          ? attention.map((goal, position) => ({
              goalId: goal.id,
              level: attentionLevel(goal, index, position),
              reason: attentionReason(goal, index),
            }))
          : [],
      milestones: [
        {
          title: milestoneTitle(index),
          observableCriterion: milestoneCriterion(index),
          targetDate: boundary.endDate,
          goalIds: attention.slice(0, MAX_ATTENTION_PER_PHASE).map((g) => g.id),
        },
      ],
    };
  });

  const roadmap = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_roadmap,
    title: bound(roadmapTitle(context), 80),
    summary: bound(roadmapSummary(context, phases.length), 600),
    startDate: start,
    endDate: end,
    phases,
    assumptions: [
      bound(
        "Your recent training is representative of what you can sustain.",
        200,
      ),
    ],
    uncertainties: [
      {
        statement: bound("The available time each week may vary.", 200),
        whyItMatters: bound(
          "Phase length assumes the pattern in your recent weeks holds.",
          200,
        ),
        whatToWatch: bound("Weeks where the planned work does not fit.", 200),
      },
    ],
    reviewPoints: [
      {
        title: bound("End of the first phase", 200),
        triggerDate: phases[0].endDate,
        triggerCondition: null,
        question: bound("Is this workload still the right size for you?", 200),
      },
    ],
    // Decision 7: a reported flag never blocks generation, and the proposal
    // must acknowledge it. Absent a flag there is nothing to say, and inventing
    // a safety note would be its own kind of wrong.
    safetyConsiderations: context.hasSafetySignal
      ? [
          bound(
            "You recorded pain, illness, injury or heavy fatigue recently, so this holds load flat on the work that involves it rather than building it.",
            240,
          ),
        ]
      : null,
  };

  return JSON.stringify({
    roadmap,
    memoryCandidates: memoryCandidates(context),
  });
}

/**
 * At most one candidate, quoting the note's first sentence exactly.
 *
 * Quoting rather than summarizing is the point: the excerpt must survive the
 * substring check in both the validator and
 * `record_roadmap_memory_candidates`, and a paraphrase never would.
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

function splitHorizon(
  start: string,
  end: string,
  count: number,
): { startDate: string; endDate: string }[] {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const totalDays = Math.round((endMs - startMs) / DAY_MS) + 1;
  const perPhase = Math.floor(totalDays / count);

  const boundaries: { startDate: string; endDate: string }[] = [];
  let cursor = startMs;
  for (let index = 0; index < count; index += 1) {
    const last = index === count - 1;
    const phaseEnd = last ? endMs : cursor + (perPhase - 1) * DAY_MS;
    boundaries.push({ startDate: toIso(cursor), endDate: toIso(phaseEnd) });
    cursor = phaseEnd + DAY_MS;
  }
  return boundaries;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function attentionLevel(
  goal: CoachAIGoalReference,
  phaseIndex: number,
  position: number,
): "primary" | "secondary" | "maintenance" | "deferred" {
  if (goal.priorityTier === "core") {
    return position === 0 ? "primary" : "secondary";
  }
  return phaseIndex === 0 ? "maintenance" : "deferred";
}

function attentionReason(goal: CoachAIGoalReference, phaseIndex: number): string {
  const base =
    goal.priorityTier === "core"
      ? "A core objective, so it shapes this block."
      : "Kept ticking over rather than pushed in this block.";
  return bound(phaseIndex === 0 ? base : `${base}`, 160);
}

function phaseTitle(index: number, total: number): string {
  if (total === 1) return "Whole horizon";
  if (index === 0) return "Build the base";
  if (index === total - 1) return "Sharpen and hold";
  return `Middle block ${index}`;
}

function phaseFocus(
  index: number,
  total: number,
  context: CoachAIContext,
): string {
  const opening =
    index === 0
      ? "Steady, repeatable work that you can complete every week."
      : index === total - 1
        ? "Less volume, more specificity, and enough rest to absorb it."
        : "Add a little more of what the objective actually demands.";
  const history =
    context.trainingHistory.sessionsIncluded === 0
      ? " There is no recent training on record, so this starts conservatively."
      : "";
  return bound(`${opening}${history}`, 300);
}

function milestoneTitle(index: number): string {
  return index === 0 ? "Four completed weeks" : "A repeatable harder week";
}

function milestoneCriterion(index: number): string {
  return index === 0
    ? "Four consecutive weeks completed as planned, without a missed week."
    : "One harder week completed and followed by a normal week.";
}

function roadmapTitle(context: CoachAIContext): string {
  const first = context.targetableGoals[0];
  return first ? `Toward ${first.title}` : "Your training direction";
}

function roadmapSummary(context: CoachAIContext, phaseCount: number): string {
  const goalCount = context.targetableGoals.length;
  const outside = context.goalsOutsideHorizon.length;
  const parts = [
    `This covers ${context.horizonStartDate} to ${context.horizonEndDate} in ${phaseCount} phases.`,
    goalCount === 0
      ? "You have no active goals yet, so it holds a general base."
      : `It works across your ${goalCount} active goal${goalCount === 1 ? "" : "s"}, building before sharpening.`,
  ];
  if (outside > 0) {
    parts.push(
      `${outside} of your goals target a date after this roadmap ends, so it builds toward them rather than reaching them.`,
    );
  }
  return parts.join(" ");
}

function bound(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}.`;
}
