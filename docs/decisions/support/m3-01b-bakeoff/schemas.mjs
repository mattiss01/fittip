/**
 * The two response schemas, mirroring `src/server/ai/contracts.ts` exactly.
 *
 * These are deliberately NOT an idealised schema. M3-01B non-goal 2 forbids
 * changing the accepted `CoachAI` contract, so the bake-off has to prove that a
 * provider can hit the shape the contract already declares. If a model cannot,
 * that is a finding about the model, not licence to reshape the contract.
 *
 * OpenAI strict mode constraints applied throughout:
 *   - every object carries `additionalProperties: false`
 *   - every property is listed in `required` (no optional keys)
 *   - no `format`, `pattern`, `minLength`, `minItems` — unsupported in strict
 *     grammar compilation, and we validate those ourselves anyway. Provider
 *     output stays untrusted; the grammar is a bonus, never the gate.
 */

export const ROADMAP_SCHEMA_VERSION = "fittip.roadmap.v1";
export const SEVEN_DAY_PLAN_SCHEMA_VERSION = "fittip.seven-day-plan.v1";

/** Mirrors `RoadmapProposal` / `RoadmapPhase`. */
export const roadmapSchema = {
  name: "fittip_roadmap",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "summary", "phases"],
    properties: {
      schemaVersion: { type: "string", enum: [ROADMAP_SCHEMA_VERSION] },
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
            endDate: { type: "string", description: "YYYY-MM-DD, inclusive." },
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
};

/** Mirrors `SevenDayPlanProposal` / `SevenDayPlanSession`. */
export const sevenDayPlanSchema = {
  name: "fittip_seven_day_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "startDate", "sessions"],
    properties: {
      schemaVersion: {
        type: "string",
        enum: [SEVEN_DAY_PLAN_SCHEMA_VERSION],
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
};

export const OPERATIONS = {
  create_roadmap: {
    schema: roadmapSchema,
    schemaVersion: ROADMAP_SCHEMA_VERSION,
  },
  create_seven_day_plan: {
    schema: sevenDayPlanSchema,
    schemaVersion: SEVEN_DAY_PLAN_SCHEMA_VERSION,
  },
};
