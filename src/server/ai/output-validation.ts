import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIContext,
  type CoachAIOperation,
  type CoachAIProposal,
  type RoadmapPhase,
  type RoadmapProposal,
  type SevenDayPlanProposal,
  type SevenDayPlanSession,
} from "@/server/ai/contracts";
import { byteLength } from "@/server/ai/context";

/**
 * Output validation. Provider output is untrusted text: it is size-bounded
 * before parsing, parsed only as strict JSON, and accepted only if every field
 * matches the operation schema exactly. Partial validity is not partial
 * acceptance — one bad field rejects the whole candidate, and a rejected
 * candidate creates no proposal and writes nothing.
 *
 * Prose is never salvaged into a plan. A model that answers in sentences has
 * failed the contract, and guessing at its intent is how an unchecked plan
 * reaches a user.
 */

export const COACH_AI_REJECTION_REASONS = [
  "too_large",
  "unparsable",
  "schema",
  "unknown_field",
  "impossible_date",
  "invalid_duration",
  "unowned_goal_reference",
  "unsafe_content",
  "business_rule",
] as const;

export type CoachAIRejectionReason =
  (typeof COACH_AI_REJECTION_REASONS)[number];

export type CoachAIValidationResult =
  | { outcome: "accepted"; proposal: CoachAIProposal }
  | { outcome: "rejected"; reason: CoachAIRejectionReason };

export const COACH_AI_MAX_OUTPUT_BYTES = 16_000;

const MAX_PHASES = 6;
const MAX_SESSIONS = 14;
const MAX_SESSIONS_PER_DAY = 2;
const PLAN_DAYS = 7;
const MAX_ROADMAP_DAYS = 400;
const MIN_SESSION_MINUTES = 10;
const MAX_SESSION_MINUTES = 240;
const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A conservative, deliberately non-exhaustive deny list. It is a backstop for
 * non-diagnostic behavior, not a safety classifier: passing it does not make a
 * candidate safe, and the product invariant on pain, illness, and injury is
 * enforced by the domain rules a consuming ticket adds, not by this regex list.
 */
const UNSAFE_PATTERNS: readonly RegExp[] = [
  /\bdiagnos(e|ed|es|is|ing)\b/i,
  /\bprescrib(e|ed|es|ing)\b/i,
  /\bprescription\b/i,
  /\b(medication|dosage|painkillers?|ibuprofen|cortisone)\b/i,
  /\b(cure|heal|treat) (your|the) \w+/i,
  /\bpush through (the |your )?pain\b/i,
  /\bignore (the|your) (pain|injury|symptoms?)\b/i,
  /\byou (probably |likely )?have (a |an )?(torn|fracture|sprain|tendinitis|tendonitis)/i,
];

export function validateCoachAICandidate(input: {
  operation: CoachAIOperation;
  body: string;
  context: CoachAIContext;
  maxBytes?: number;
}): CoachAIValidationResult {
  const maxBytes = input.maxBytes ?? COACH_AI_MAX_OUTPUT_BYTES;

  // Size first, before anything parses it.
  if (byteLength(input.body) > maxBytes) {
    return rejected("too_large");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return rejected("unparsable");
  }

  if (!isRecord(parsed)) return rejected("schema");

  // Only goals the owner may actually be coached toward. An achieved goal is
  // readable history under ADR-012 and is never a valid objective, so it is
  // absent from this set on purpose.
  const targetableGoalIds = new Set(
    input.context.targetableGoals.map((goal) => goal.id),
  );

  const result =
    input.operation === "create_roadmap"
      ? validateRoadmap(parsed, input.context, targetableGoalIds)
      : validateSevenDayPlan(parsed, input.context, targetableGoalIds);

  if (result.outcome === "rejected") return result;

  // Content safety runs last so its rejections are not masked by a structural
  // failure that would have rejected the candidate anyway.
  return containsUnsafeContent(result.proposal)
    ? rejected("unsafe_content")
    : result;
}

function validateRoadmap(
  parsed: Record<string, unknown>,
  context: CoachAIContext,
  targetableGoalIds: Set<string>,
): CoachAIValidationResult {
  const unknownField = findUnknownField(parsed, [
    "schemaVersion",
    "summary",
    "phases",
  ]);
  if (unknownField) return rejected("unknown_field");

  if (
    parsed.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_roadmap ||
    !isBounded(parsed.summary, 1, 600) ||
    !Array.isArray(parsed.phases)
  ) {
    return rejected("schema");
  }

  if (parsed.phases.length < 1 || parsed.phases.length > MAX_PHASES) {
    return rejected("business_rule");
  }

  const todayMs = Date.parse(`${context.today}T00:00:00.000Z`);
  const phases: RoadmapPhase[] = [];
  let previousEndMs = -Infinity;

  for (const entry of parsed.phases) {
    if (!isRecord(entry)) return rejected("schema");
    if (
      findUnknownField(entry, [
        "title",
        "focus",
        "startDate",
        "endDate",
        "goalId",
      ])
    ) {
      return rejected("unknown_field");
    }
    if (
      !isBounded(entry.title, 1, 120) ||
      !isBounded(entry.focus, 1, 300) ||
      typeof entry.goalId !== "string"
    ) {
      return rejected("schema");
    }

    const startMs = parseIsoDate(entry.startDate);
    const endMs = parseIsoDate(entry.endDate);
    if (startMs === null || endMs === null) return rejected("impossible_date");
    if (
      endMs < startMs ||
      startMs < todayMs - DAY_MS ||
      endMs > todayMs + MAX_ROADMAP_DAYS * DAY_MS
    ) {
      return rejected("impossible_date");
    }
    if (startMs < previousEndMs) return rejected("business_rule");
    previousEndMs = endMs;

    if (!targetableGoalIds.has(entry.goalId)) {
      return rejected("unowned_goal_reference");
    }

    phases.push({
      title: entry.title,
      focus: entry.focus,
      startDate: entry.startDate as string,
      endDate: entry.endDate as string,
      goalId: entry.goalId,
    });
  }

  const proposal: RoadmapProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_roadmap,
    summary: parsed.summary,
    phases,
  };
  return { outcome: "accepted", proposal };
}

function validateSevenDayPlan(
  parsed: Record<string, unknown>,
  context: CoachAIContext,
  targetableGoalIds: Set<string>,
): CoachAIValidationResult {
  if (findUnknownField(parsed, ["schemaVersion", "startDate", "sessions"])) {
    return rejected("unknown_field");
  }

  if (
    parsed.schemaVersion !== COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan ||
    !Array.isArray(parsed.sessions)
  ) {
    return rejected("schema");
  }

  const startMs = parseIsoDate(parsed.startDate);
  const todayMs = Date.parse(`${context.today}T00:00:00.000Z`);
  if (startMs === null) return rejected("impossible_date");
  if (startMs < todayMs || startMs > todayMs + PLAN_DAYS * DAY_MS) {
    return rejected("impossible_date");
  }

  if (parsed.sessions.length < 1 || parsed.sessions.length > MAX_SESSIONS) {
    return rejected("business_rule");
  }

  const sessions: SevenDayPlanSession[] = [];
  const perDay = new Map<string, number>();

  for (const entry of parsed.sessions) {
    if (!isRecord(entry)) return rejected("schema");
    if (
      findUnknownField(entry, [
        "date",
        "title",
        "intent",
        "durationMinutes",
        "goalId",
      ])
    ) {
      return rejected("unknown_field");
    }
    if (
      !isBounded(entry.title, 1, 120) ||
      !isBounded(entry.intent, 1, 300) ||
      typeof entry.goalId !== "string"
    ) {
      return rejected("schema");
    }

    const dateMs = parseIsoDate(entry.date);
    if (dateMs === null) return rejected("impossible_date");
    if (dateMs < startMs || dateMs >= startMs + PLAN_DAYS * DAY_MS) {
      return rejected("impossible_date");
    }

    if (
      typeof entry.durationMinutes !== "number" ||
      !Number.isSafeInteger(entry.durationMinutes) ||
      entry.durationMinutes < MIN_SESSION_MINUTES ||
      entry.durationMinutes > MAX_SESSION_MINUTES
    ) {
      return rejected("invalid_duration");
    }

    if (!targetableGoalIds.has(entry.goalId)) {
      return rejected("unowned_goal_reference");
    }

    const date = entry.date as string;
    const count = (perDay.get(date) ?? 0) + 1;
    if (count > MAX_SESSIONS_PER_DAY) return rejected("business_rule");
    perDay.set(date, count);

    sessions.push({
      date,
      title: entry.title,
      intent: entry.intent,
      durationMinutes: entry.durationMinutes,
      goalId: entry.goalId,
    });
  }

  const proposal: SevenDayPlanProposal = {
    schemaVersion: COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan,
    startDate: parsed.startDate as string,
    sessions,
  };
  return { outcome: "accepted", proposal };
}

function containsUnsafeContent(proposal: CoachAIProposal): boolean {
  const strings =
    "phases" in proposal
      ? [
          proposal.summary,
          ...proposal.phases.flatMap((phase) => [phase.title, phase.focus]),
        ]
      : proposal.sessions.flatMap((session) => [session.title, session.intent]);

  return strings.some((value) =>
    UNSAFE_PATTERNS.some((pattern) => pattern.test(value)),
  );
}

/** Returns the first key outside the allowlist, so extra fields reject. */
function findUnknownField(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  return Object.keys(value).find((key) => !allowed.includes(key)) ?? null;
}

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return null;
  // Rejects a day that silently rolled over, such as 2026-04-31.
  return parsed.toISOString().slice(0, 10) === value ? time : null;
}

function isBounded(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" && value.length >= min && value.length <= max
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejected(reason: CoachAIRejectionReason): CoachAIValidationResult {
  return { outcome: "rejected", reason };
}
