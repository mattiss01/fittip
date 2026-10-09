import { describe, expect, it } from "vitest";

import { COACH_AI_LIVE_LIMITS } from "@/server/ai/budget";
import { COACH_AI_CONTEXT_LIMITS } from "@/server/ai/context";
import { TRAINING_MEASUREMENT_MODES } from "@/lib/training/measurement";
import {
  COACH_AI_FIXTURE_CONTEXT,
  COACH_AI_FIXTURE_PLANNING_NOTE,
} from "@/server/ai/fixtures/fixture-corpus";
import {
  buildCoachAIMessages,
  COACH_AI_RESPONSE_SCHEMAS,
  coachAIStaticPrefix,
} from "@/server/ai/openai-prompt";

const STATIC_PREFIX_BUDGET = 6_000;

/**
 * The plan prompt gets a larger allowance than the roadmap's, and that is a
 * derivation rather than a concession. The real constraint is
 * `prefix + wrapper + context <= 4 * maxInputTokens`.
 *
 * M3-16B spent the slack this used to describe. The plan's context allocation
 * was 28,500 bytes against the roadmap's 33,700 — a week of training needs no
 * 52-week forward window — and the accepted roadmap the plan now reads raised
 * it to 32,500. The paragraph describing that roadmap took the prefix to 6,991
 * characters, so the budget moved 7,000 to 7,400 in the same ticket:
 *
 *   7,400 + 64 + 32,500 = 39,964   ceil(39,964 / 4) = 9,991  vs  10,000
 *
 * That was the whole ceiling, with 9 tokens over, until 9 October 2026. The
 * owner raised `maxInputTokens` to 14,000 that day and ADR-024 took the first
 * of the room: the paragraph about planned sessions and their replace handles
 * moved this budget 7,400 to 8,000, and the context 32,500 to 35,100.
 *
 *   8,000 + 64 + 35,100 = 43,164   ceil(43,164 / 4) = 10,791  vs  14,000
 *
 * The assertions below read `bytes.total` rather than a literal, so they bind
 * whatever the allocation becomes; this comment is the one thing that has to
 * be kept honest by hand.
 */
const PLAN_STATIC_PREFIX_BUDGET = 8_000;

describe("the roadmap prompt", () => {
  it("stays inside the prefix budget the context allocation was derived against", () => {
    // Every character here is a character the context cannot have: the adapter
    // refuses a request whose estimated input tokens exceed `maxInputTokens`,
    // counting the whole message set at four characters per token. If this
    // grows, the allocation in `context.ts` must shrink to match.
    const prefix = coachAIStaticPrefix("create_roadmap");

    expect(prefix.length).toBeLessThanOrEqual(STATIC_PREFIX_BUDGET);
    // Against the budget rather than today's length, because the allocation in
    // `context.ts` was derived against the budget: a prefix that grew to 6,000
    // must still fit under the ceiling without the context shrinking.
    const worstCase =
      STATIC_PREFIX_BUDGET +
      64 +
      COACH_AI_CONTEXT_LIMITS.create_roadmap.bytes.total;
    expect(Math.ceil(worstCase / 4)).toBeLessThanOrEqual(
      COACH_AI_LIVE_LIMITS.maxInputTokens,
    );
  });

  it("is byte-identical on every request, so a cache hit is possible at all", () => {
    // Prompt caching requires an exact prefix match, and training history
    // changes every time a session is logged. The prefix therefore holds
    // nothing owner-specific.
    const first = coachAIStaticPrefix("create_roadmap");
    const second = coachAIStaticPrefix("create_roadmap");

    expect(first).toBe(second);
  });

  it("puts every static byte before every volatile one", () => {
    const messages = buildCoachAIMessages(
      "create_roadmap",
      COACH_AI_FIXTURE_CONTEXT,
    );

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(coachAIStaticPrefix("create_roadmap"));
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain(COACH_AI_FIXTURE_PLANNING_NOTE);
    // No owner content in the cacheable half.
    expect(messages[0].content).not.toContain(COACH_AI_FIXTURE_PLANNING_NOTE);
    expect(messages[0].content).not.toContain(
      COACH_AI_FIXTURE_CONTEXT.targetableGoals[0].id,
    );
  });

  it("labels owner text as context rather than as instruction", () => {
    // ADR-014 decision 4: this reduces accidental injection. It is not what
    // makes the boundary safe — the output validator is — and the prompt says
    // so explicitly rather than implying the labelling is the control.
    const prefix = coachAIStaticPrefix("create_roadmap");

    expect(prefix).toContain("written by the athlete");
    expect(prefix).toContain("never as instructions");
  });

  it("names the conservative behaviours decision 7 requires", () => {
    const prefix = coachAIStaticPrefix("create_roadmap");

    expect(prefix).toContain("Never increase load on it");
    expect(prefix).toContain("never state that something is safe");
    expect(prefix).toContain("safetyConsiderations");
  });

  it("asks for excerpts rather than paraphrases, and excludes feedback", () => {
    const prefix = coachAIStaticPrefix("create_roadmap");

    expect(prefix).toContain("exact substring");
    expect(prefix).toContain("do not paraphrase it");
    expect(prefix).toContain("must never appear here");
  });

  it("serializes the context compactly", () => {
    const messages = buildCoachAIMessages(
      "create_roadmap",
      COACH_AI_FIXTURE_CONTEXT,
    );

    // Indentation measured 21-32% larger across the four bake-off scenarios. At
    // an 8,000-token input ceiling that is a fifth of the budget spent on
    // whitespace no model needs.
    expect(messages[1].content).toContain(
      JSON.stringify(COACH_AI_FIXTURE_CONTEXT),
    );
  });
});

describe("the roadmap response grammar", () => {
  it("satisfies OpenAI strict mode throughout", () => {
    // Strict grammar compilation rejects a missing `additionalProperties`, a
    // property absent from `required`, and every string constraint keyword.
    const problems: string[] = [];

    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;

      for (const banned of [
        "format",
        "pattern",
        "minLength",
        "minItems",
        "maxItems",
      ]) {
        if (banned in record) problems.push(`${path}.${banned}`);
      }

      // A nullable object is still an object to the grammar compiler.
      const isObject =
        record.type === "object" ||
        (Array.isArray(record.type) && record.type.includes("object"));
      if (isObject) {
        if (record.additionalProperties !== false) {
          problems.push(`${path}: additionalProperties`);
        }
        const properties = (record.properties ?? {}) as Record<string, unknown>;
        const required = (record.required ?? []) as string[];
        for (const key of Object.keys(properties)) {
          if (!required.includes(key))
            problems.push(`${path}: ${key} optional`);
        }
      }

      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
    };

    walk(COACH_AI_RESPONSE_SCHEMAS.create_roadmap.schema, "roadmap");
    walk(COACH_AI_RESPONSE_SCHEMAS.create_seven_day_plan.schema, "plan");
    walk(
      COACH_AI_RESPONSE_SCHEMAS.fill_session_activities.schema,
      "sessionActivities",
    );
    expect(problems).toEqual([]);
  });

  it("expresses optional fields as nullable rather than omitted", () => {
    const schema = COACH_AI_RESPONSE_SCHEMAS.create_roadmap.schema as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    const roadmap = schema.properties.roadmap;

    expect(roadmap.properties.assumptions.type).toEqual(["array", "null"]);
    expect(roadmap.properties.safetyConsiderations.type).toEqual([
      "array",
      "null",
    ]);
    expect(schema.properties.memoryCandidates.type).toEqual(["array", "null"]);
  });

  it("pins the schema version the validator accepts", () => {
    const schema = COACH_AI_RESPONSE_SCHEMAS.create_roadmap.schema as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(schema.properties.roadmap.properties.schemaVersion.enum).toEqual([
      "fittip.roadmap.v2",
    ]);
  });
});

describe("the plan prompt", () => {
  it("stays inside the prefix budget the context allocation was derived against", () => {
    const prefix = coachAIStaticPrefix("create_seven_day_plan");

    expect(prefix.length).toBeLessThanOrEqual(PLAN_STATIC_PREFIX_BUDGET);
    const worstCase =
      PLAN_STATIC_PREFIX_BUDGET +
      64 +
      COACH_AI_CONTEXT_LIMITS.create_seven_day_plan.bytes.total;
    expect(Math.ceil(worstCase / 4)).toBeLessThanOrEqual(
      COACH_AI_LIVE_LIMITS.maxInputTokens,
    );
  });

  it("shares the cacheable system half with the roadmap", () => {
    // Prompt caching matches a prefix byte for byte, so the operation-specific
    // half comes last and the shared half is identical.
    const plan = coachAIStaticPrefix("create_seven_day_plan");
    const roadmap = coachAIStaticPrefix("create_roadmap");
    const shared = plan.slice(0, plan.indexOf("# This request"));

    expect(roadmap.startsWith(shared)).toBe(true);
    expect(plan).toBe(coachAIStaticPrefix("create_seven_day_plan"));
    expect(plan).not.toContain(COACH_AI_FIXTURE_PLANNING_NOTE);
  });

  it("says the horizon is the athlete's and not the model's", () => {
    const prefix = coachAIStaticPrefix("create_seven_day_plan");

    expect(prefix).toContain("the athlete chose it");
    expect(prefix).toContain("Do not extend it, shorten it, shift it");
    expect(prefix).toContain("At most three sessions on any one date");
  });

  it("asks for unweighted allocation and no session detail", () => {
    const prefix = coachAIStaticPrefix("create_seven_day_plan");

    // Decision 6 and the M3-03D boundary, both stated to the model as well as
    // enforced afterwards. The enforcement is what makes them true; saying them
    // is what stops the common case being a rejection.
    expect(prefix).toContain("never express attention as a percentage");
    expect(prefix).toContain(
      "Do not break it into exercises, sets, reps, loads, distances, paces",
    );
  });
});

describe("the plan response grammar", () => {
  it("admits no weight, activity, or target property anywhere", () => {
    const serialized = JSON.stringify(
      COACH_AI_RESPONSE_SCHEMAS.create_seven_day_plan.schema,
    );

    for (const banned of [
      '"weight"',
      '"percent"',
      '"share"',
      '"activities"',
      '"targets"',
      '"measurementMode"',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("pins the schema version the validator accepts", () => {
    const schema = COACH_AI_RESPONSE_SCHEMAS.create_seven_day_plan
      .schema as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(schema.properties.plan.properties.schemaVersion.enum).toEqual([
      "fittip.seven-day-plan.v2",
    ]);
    expect(schema.properties.plan.properties.weekDescription.type).toBe(
      "string",
    );
  });
});

/**
 * A7-2. One session rather than a horizon, so the allocation is smaller than
 * the plan's and the prefix budget is the figure `context.ts` derived it from:
 *
 *   7,000 + 64 + 32,400 = 39,464   ceil(39,464 / 4) = 9,866  vs  10,000
 */
const SESSION_ACTIVITIES_STATIC_PREFIX_BUDGET = 7_000;

describe("the session activities prompt", () => {
  it("stays inside the prefix budget the context allocation was derived against", () => {
    const prefix = coachAIStaticPrefix("fill_session_activities");

    expect(prefix.length).toBeLessThanOrEqual(
      SESSION_ACTIVITIES_STATIC_PREFIX_BUDGET,
    );
    const worstCase =
      SESSION_ACTIVITIES_STATIC_PREFIX_BUDGET +
      64 +
      COACH_AI_CONTEXT_LIMITS.fill_session_activities.bytes.total;
    expect(Math.ceil(worstCase / 4)).toBeLessThanOrEqual(
      COACH_AI_LIVE_LIMITS.maxInputTokens,
    );
  });

  it("names every measurement mode the validator accepts", () => {
    const prefix = coachAIStaticPrefix("fill_session_activities");

    for (const mode of TRAINING_MEASUREMENT_MODES) {
      expect(prefix).toContain(`"${mode}"`);
    }
  });

  it("pins the schema version the validator accepts", () => {
    const schema = COACH_AI_RESPONSE_SCHEMAS.fill_session_activities
      .schema as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;

    expect(schema.properties.schemaVersion.enum).toEqual([
      "fittip.session-activities.v1",
    ]);
    expect(
      schema.properties.activities.items.properties.measurementMode.enum,
    ).toEqual([...TRAINING_MEASUREMENT_MODES]);
  });
});
