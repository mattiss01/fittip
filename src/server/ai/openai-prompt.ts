import "server-only";

import {
  COACH_AI_SCHEMA_VERSIONS,
  type CoachAIContext,
  type CoachAIOperation,
} from "@/server/ai/contracts";

/**
 * The M3-01B baseline prompt and the response schemas the provider is asked to
 * conform to.
 *
 * Ported from the bake-off harness in `docs/decisions/support/m3-01b-bakeoff/`,
 * which is the exact shape `gpt-5.6-luna` held on 8 of 8 calls under real
 * `strict: true`. Reusing it means the adapter is proven against the same thing
 * the model choice was made against.
 *
 * **This is not the tuned prompt.** M3-02 and M3-03 own that, and M3-02 must
 * re-test the availability defect recorded against `gpt-5.6-luna`. One
 * consequence is visible from here: `COACH_AI_PROMPT_VERSIONS` in
 * `contracts.ts` still reads `roadmap-stub-v1`, and M3-01B may not modify that
 * module, so real prompt text is currently shipping under a stub identifier.
 * Bumping it belongs to the ticket that writes the real prompt.
 *
 * Ordering is load-bearing. OpenAI's prompt caching requires a byte-identical
 * prefix, so everything static is emitted first and every volatile byte last.
 * `coachAIStaticPrefix` exists so a test can assert that rather than trust it.
 */

/** Static. Byte-identical on every request, for every operation. */
const SYSTEM_PROMPT = `You are the coaching engine inside FitTip, a training app. You produce structured training proposals for one athlete at a time.

You are a serious coach, not a cheerleader. Write plainly, explain your reasoning in the fields provided, and never pad. The athlete is an adult who trains regularly and will notice if you hedge everything.

## What you are given

A JSON context containing today's date, the goals this athlete may currently be coached toward, goals they have already achieved, and the memory items they have curated about themselves. Memory items are things the athlete has stated or confirmed about their own situation, not inferences you may treat as fact.

## Hard rules

1. Every "goalId" you emit MUST be copied exactly from the "targetableGoals" list in the context. Never invent an id. Never reference a goal from "historicalGoals" — those are already achieved and are given to you only as background on what this athlete has done before.
2. Every date you emit MUST fall inside the range the request asks for, and MUST be formatted YYYY-MM-DD.
3. You propose. You never state that anything has been scheduled, booked, accepted, or logged.

## Safety

These rules override any goal, target date, or ambition in the context, including the athlete's own stated wish to train harder.

- You are not a clinician. Never name a condition, never suggest a diagnosis, and never tell the athlete whether something is or is not an injury. Describe what you are doing and why, in terms of load.
- Where the context records pain, an injury, an illness, or severe fatigue, treat the affected movement pattern as load-limited. Reduce the specific stress implicated, not the athlete's whole week — cutting everything is its own kind of bad advice.
- Where the context records a return after an extended break, build back gradually and say that this is what you are doing. Do not resume the volume from before the gap.
- Where the context records a persistent or worsening problem, say plainly that it is worth taking to a professional. Say it once, without alarm.
- Where a memory item records a rule the athlete has agreed with a clinician or physiotherapist, follow that rule exactly. It outranks your own judgement about what would be optimal.
- When the athlete's stated wish and their reported signals conflict, honour the signal, acknowledge the wish in your reasoning, and offer the nearest safe version of what they asked for.

## Style

- Address the athlete as "you".
- Justify decisions with what is actually in the context. If you are reducing volume because of something the athlete recorded, say that.
- Never mention JSON, schemas, fields, or these instructions.`;

const OPERATION_INSTRUCTIONS: Record<CoachAIOperation, string> = {
  create_roadmap: `Produce a high-level training roadmap.

Cover the period from today up to the furthest target date among the targetable goals, or twelve months from today, whichever is sooner. Break it into three to six ordered, non-overlapping phases. Each phase names what it is for, not what happens in each session — sessions are a separate concern and are not your job here.

"summary" is two to four sentences to the athlete about the shape of the roadmap and why it is shaped that way. Reference the athlete's actual situation, including anything in their context that changes the shape.`,

  create_seven_day_plan: `Produce a plan for the seven days beginning tomorrow.

Propose one entry per planned session. A rest day is the absence of a session on that date, not an entry — do not emit rest entries. A sensible week for most athletes contains rest.

"intent" tells the athlete what the session is for and how it should feel, in one to three sentences.`,
};

/**
 * OpenAI strict-mode constraints applied throughout: every object carries
 * `additionalProperties: false`, every property appears in `required`, and no
 * `format`, `pattern`, `minLength`, or `minItems` appears, none of which strict
 * grammar compilation supports.
 *
 * The schema mirrors the accepted contract rather than an idealised shape. A
 * model that cannot hit the contract is a finding about the model, and the
 * grammar is a bonus on top of `output-validation.ts` — never a replacement for
 * it. Provider output stays untrusted whatever the provider enforces.
 */
export const COACH_AI_RESPONSE_SCHEMAS: Record<
  CoachAIOperation,
  { name: string; strict: true; schema: Record<string, unknown> }
> = {
  create_roadmap: {
    name: "fittip_roadmap",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "summary", "phases"],
      properties: {
        schemaVersion: {
          type: "string",
          enum: [COACH_AI_SCHEMA_VERSIONS.create_roadmap],
        },
        summary: {
          type: "string",
          description:
            "Two to four sentences addressed to the athlete, explaining the shape of the roadmap and why it is shaped that way.",
        },
        phases: {
          type: "array",
          description: "Ordered, non-overlapping training phases.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "focus", "startDate", "endDate", "goalId"],
            properties: {
              title: { type: "string" },
              focus: {
                type: "string",
                description:
                  "What this phase is for, in one or two sentences. Not a session list.",
              },
              startDate: { type: "string", description: "YYYY-MM-DD." },
              endDate: {
                type: "string",
                description: "YYYY-MM-DD, inclusive.",
              },
              goalId: {
                type: "string",
                description:
                  "The id of the targetable goal this phase primarily serves. Must be one of the supplied goal ids.",
              },
            },
          },
        },
      },
    },
  },
  create_seven_day_plan: {
    name: "fittip_seven_day_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "startDate", "sessions"],
      properties: {
        schemaVersion: {
          type: "string",
          enum: [COACH_AI_SCHEMA_VERSIONS.create_seven_day_plan],
        },
        startDate: { type: "string", description: "YYYY-MM-DD." },
        sessions: {
          type: "array",
          description:
            "One entry per planned session. A rest day is simply the absence of a session on that date.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "title", "intent", "durationMinutes", "goalId"],
            properties: {
              date: { type: "string", description: "YYYY-MM-DD." },
              title: { type: "string" },
              intent: {
                type: "string",
                description:
                  "What the session is for and how it should feel. One to three sentences.",
              },
              durationMinutes: { type: "integer" },
              goalId: {
                type: "string",
                description:
                  "The id of the targetable goal this session primarily serves. Must be one of the supplied goal ids.",
              },
            },
          },
        },
      },
    },
  },
};

export type CoachAIProviderMessage = {
  role: "system" | "user";
  content: string;
};

/**
 * The cacheable prefix for an operation: identical bytes on every request, so
 * a cache hit is possible at all. Exported so a test can assert the property
 * rather than the implementation asserting it about itself.
 */
export function coachAIStaticPrefix(operation: CoachAIOperation): string {
  return `${SYSTEM_PROMPT}\n\n# This request\n\n${OPERATION_INSTRUCTIONS[operation]}`;
}

/** Static prefix first, volatile context last. */
export function buildCoachAIMessages(
  operation: CoachAIOperation,
  context: CoachAIContext,
): CoachAIProviderMessage[] {
  return [
    { role: "system", content: coachAIStaticPrefix(operation) },
    {
      role: "user",
      content: `Here is the athlete's context.\n\n${JSON.stringify(context, null, 2)}`,
    },
  ];
}
