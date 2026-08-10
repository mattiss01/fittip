import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { CoachAIContext, CoachAIRequest } from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import {
  OpenAICoachAI,
  type CoachAITruncation,
} from "@/server/ai/openai-adapter";
import { coachAIStaticPrefix } from "@/server/ai/openai-prompt";

/**
 * The adapter is proven against a local stub, never against the provider.
 *
 * M3-01B forbids a real call from this ticket, and a stub is also the only way
 * to test what actually goes wrong in production: a hang, a 429, a 5xx, a body
 * that is not JSON, and a response the model ran out of room to finish. None of
 * those is reproducible on demand against a real API, and each of them costs
 * money to provoke.
 */

const CREDENTIAL = "not-a-real-key-000000000000000000";

type StubHandler = (
  request: IncomingMessage,
  respond: (status: number, body: string) => void,
) => void;

let server: Server | null = null;
const received: { body: string; authorization: string | undefined }[] = [];

async function startStub(handler: StubHandler): Promise<string> {
  received.length = 0;
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      received.push({
        body: raw,
        authorization: request.headers.authorization,
      });
      handler(request, (status, body) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(body);
      });
    });
  });

  await new Promise<void>((resolve) => {
    server!.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}/v1`;
}

afterEach(async () => {
  if (!server) return;
  const closing = server;
  server = null;
  closing.closeAllConnections?.();
  await new Promise<void>((resolve) => closing.close(() => resolve()));
});

function jsonResponse(
  content: string,
  extras: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 2972, completion_tokens: 1513 },
    ...extras,
  });
}

const PLAN_BODY = JSON.stringify({
  schemaVersion: "fittip.seven-day-plan.v1",
  startDate: "2026-08-11",
  sessions: [],
});

function context(overrides: Partial<CoachAIContext> = {}): CoachAIContext {
  return {
    today: "2026-08-10",
    targetableGoals: [],
    historicalGoals: [],
    memory: [],
    ...overrides,
  };
}

function buildRequest(overrides: Partial<CoachAIRequest> = {}): CoachAIRequest {
  return {
    requestId: "11111111-1111-4111-8111-111111111111",
    ownerId: "22222222-2222-4222-8222-222222222222",
    operation: "create_seven_day_plan",
    schemaVersion: "fittip.seven-day-plan.v1",
    promptVersion: "seven-day-plan-stub-v1",
    environment: "local",
    requestedAt: "2026-08-10T09:00:00.000Z",
    idempotencyKey: "a".repeat(64),
    maxInputTokens: 8_000,
    maxOutputTokens: 3_000,
    deadlineMs: 30_000,
    context: context(),
    ...overrides,
  };
}

function adapter(
  baseUrl: string,
  onTruncated?: (truncation: CoachAITruncation) => void,
): OpenAICoachAI {
  return new OpenAICoachAI({
    apiKey: CREDENTIAL,
    modelCode: "gpt-5.6-luna",
    baseUrl,
    onTruncated,
  });
}

async function codeFor(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CoachAIError) return error.code;
    throw error;
  }
  throw new Error("expected the adapter to fail");
}

describe("OpenAI coaching adapter", () => {
  it("returns the provider body and its reported usage untouched", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse(PLAN_BODY)),
    );

    const candidate = await adapter(baseUrl).createSevenDayPlan(buildRequest());

    expect(candidate).toEqual({
      body: PLAN_BODY,
      reportedInputTokens: 2972,
      reportedOutputTokens: 1513,
    });
  });

  it("issues exactly one request and never retries", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(500, JSON.stringify({ error: "upstream" })),
    );

    // Decision 5: a call that fails after the provider generated a response has
    // already been charged, so a retry buys a second charge for one proposal.
    expect(
      await codeFor(adapter(baseUrl).createSevenDayPlan(buildRequest())),
    ).toBe("provider_unavailable");
    expect(received).toHaveLength(1);
  });

  it("sends the cacheable static prefix first and unchanged by context", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse(PLAN_BODY)),
    );
    const provider = adapter(baseUrl);

    await provider.createSevenDayPlan(buildRequest());
    await provider.createSevenDayPlan(
      buildRequest({
        context: context({
          memory: [
            { id: "m1", memoryType: "constraint", content: "No gym Tuesdays." },
          ],
        }),
      }),
    );

    const prefixes = received.map(
      (entry) => JSON.parse(entry.body).messages[0].content,
    );
    // A cached prefix must match exactly, so anything volatile has to come
    // after it or caching cannot fire at all.
    expect(prefixes[0]).toBe(coachAIStaticPrefix("create_seven_day_plan"));
    expect(prefixes[1]).toBe(prefixes[0]);
    expect(JSON.parse(received[1].body).messages[1].content).toContain(
      "No gym Tuesdays.",
    );
  });

  it("asks the provider to enforce the schema as well", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse(PLAN_BODY)),
    );

    await adapter(baseUrl).createSevenDayPlan(buildRequest());

    const sent = JSON.parse(received[0].body);
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.max_completion_tokens).toBe(3_000);
    expect(sent.model).toBe("gpt-5.6-luna");
  });

  it.each<[string, number, string]>([
    ["a rate limit", 429, "rate_limited"],
    ["a server fault", 500, "provider_unavailable"],
    ["a bad gateway", 503, "provider_unavailable"],
    ["a rejected credential", 401, "credential_unavailable"],
    ["a forbidden project", 403, "credential_unavailable"],
    ["an unexpected client error", 400, "provider_unavailable"],
  ])("maps %s to %s", async (_case, status, code) => {
    const baseUrl = await startStub((_request, respond) =>
      respond(status, JSON.stringify({ error: { message: "nope" } })),
    );

    expect(
      await codeFor(adapter(baseUrl).createSevenDayPlan(buildRequest())),
    ).toBe(code);
  });

  it("treats a malformed envelope as a broken provider", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, "not json at all"),
    );

    expect(
      await codeFor(adapter(baseUrl).createSevenDayPlan(buildRequest())),
    ).toBe("provider_unavailable");
  });

  it("refuses an envelope carrying no message content", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(
        200,
        JSON.stringify({
          choices: [{ finish_reason: "content_filter", message: {} }],
        }),
      ),
    );

    expect(
      await codeFor(adapter(baseUrl).createSevenDayPlan(buildRequest())),
    ).toBe("provider_unavailable");
  });

  it("passes a malformed proposal through for the domain service to reject", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse("Here is your plan: run on Tuesday.")),
    );

    // A well-formed envelope carrying prose is not a provider failure. Deciding
    // it is invalid belongs to output validation, which is the only thing that
    // knows what a valid proposal looks like.
    const candidate = await adapter(baseUrl).createSevenDayPlan(buildRequest());
    expect(candidate.body).toBe("Here is your plan: run on Tuesday.");
  });

  it("reports unknown usage as unknown rather than as zero", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(
        200,
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: PLAN_BODY } }],
        }),
      ),
    );

    const candidate = await adapter(baseUrl).createSevenDayPlan(buildRequest());
    expect(candidate.reportedInputTokens).toBeNull();
    expect(candidate.reportedOutputTokens).toBeNull();
  });

  describe("truncation", () => {
    it("returns the truncated body and reports the truncation explicitly", async () => {
      const truncated = '{"schemaVersion":"fittip.seven-day-plan.v1","sess';
      const baseUrl = await startStub((_request, respond) =>
        respond(
          200,
          JSON.stringify({
            choices: [
              { finish_reason: "length", message: { content: truncated } },
            ],
            usage: { prompt_tokens: 2972, completion_tokens: 3000 },
          }),
        ),
      );
      const truncations: CoachAITruncation[] = [];

      const candidate = await adapter(baseUrl, (event) =>
        truncations.push(event),
      ).createSevenDayPlan(buildRequest());

      // Returned rather than thrown: the reported usage is real, so settlement
      // reconciles against what was spent instead of charging the whole
      // reservation.
      expect(candidate.body).toBe(truncated);
      expect(candidate.reportedOutputTokens).toBe(3000);
      expect(truncations).toEqual([
        {
          requestId: "11111111-1111-4111-8111-111111111111",
          operation: "create_seven_day_plan",
          reportedOutputTokens: 3000,
          maxOutputTokens: 3_000,
        },
      ]);
    });

    it("is distinguishable from a model that simply broke the schema", async () => {
      const baseUrl = await startStub((_request, respond) =>
        respond(200, jsonResponse('{"schemaVersion":"wrong"}')),
      );
      const truncations: CoachAITruncation[] = [];

      const candidate = await adapter(baseUrl, (event) =>
        truncations.push(event),
      ).createSevenDayPlan(buildRequest());

      // The 9 August 2026 bake-off spent sixteen billed calls on exactly this
      // confusion: an output cap starved a model into what looked like an
      // inability to hold the schema. A complete response that violates the
      // schema must not raise the truncation signal.
      expect(candidate.body).toBe('{"schemaVersion":"wrong"}');
      expect(truncations).toEqual([]);
    });
  });

  describe("the deadline", () => {
    it("gives up on a provider that answers too slowly", async () => {
      const baseUrl = await startStub((_request, respond) => {
        setTimeout(() => respond(200, jsonResponse(PLAN_BODY)), 2_000).unref();
      });

      expect(
        await codeFor(
          adapter(baseUrl).createSevenDayPlan(buildRequest({ deadlineMs: 60 })),
        ),
      ).toBe("deadline_exceeded");
    });

    it("gives up on a provider that never answers at all", async () => {
      const baseUrl = await startStub(() => {
        // Deliberately never responds and never closes the socket.
      });

      expect(
        await codeFor(
          adapter(baseUrl).createSevenDayPlan(buildRequest({ deadlineMs: 60 })),
        ),
      ).toBe("deadline_exceeded");
    });

    it("maps a refused connection to an unavailable provider, not a deadline", async () => {
      // Port 1 on loopback refuses immediately, so this is a transport failure
      // rather than a slow one.
      expect(
        await codeFor(
          adapter("http://127.0.0.1:1/v1").createSevenDayPlan(buildRequest()),
        ),
      ).toBe("provider_unavailable");
    });
  });

  describe("the credential", () => {
    it("is sent to the provider and to nowhere else", async () => {
      const baseUrl = await startStub((_request, respond) =>
        respond(200, jsonResponse(PLAN_BODY)),
      );

      const candidate =
        await adapter(baseUrl).createSevenDayPlan(buildRequest());

      expect(received[0].authorization).toBe(`Bearer ${CREDENTIAL}`);
      expect(JSON.stringify(candidate)).not.toContain(CREDENTIAL);
      expect(received[0].body).not.toContain(CREDENTIAL);
    });

    it("never appears in a thrown error", async () => {
      const baseUrl = await startStub((_request, respond) =>
        respond(401, JSON.stringify({ error: { message: CREDENTIAL } })),
      );

      try {
        await adapter(baseUrl).createSevenDayPlan(buildRequest());
        throw new Error("expected the adapter to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(CoachAIError);
        const rendered = `${(error as Error).message}${(error as Error).stack}`;
        // A provider error body can echo the key back. Nothing here forwards a
        // raw provider message, so it cannot travel with the failure.
        expect(rendered).not.toContain(CREDENTIAL);
      }
    });

    it("refuses to construct without one", () => {
      expect(
        () => new OpenAICoachAI({ apiKey: "   ", modelCode: "gpt-5.6-luna" }),
      ).toThrow(CoachAIError);
      expect(
        () => new OpenAICoachAI({ apiKey: CREDENTIAL, modelCode: "" }),
      ).toThrow(CoachAIError);
    });
  });

  it("refuses an oversized context before spending anything", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse(PLAN_BODY)),
    );

    const code = await codeFor(
      adapter(baseUrl).createSevenDayPlan(
        buildRequest({
          maxInputTokens: 10,
          context: context({
            memory: [
              {
                id: "m1",
                memoryType: "preference",
                content: "x".repeat(5_000),
              },
            ],
          }),
        }),
      ),
    );

    expect(code).toBe("context_too_large");
    // The cheapest refusal is the one that never opens a socket.
    expect(received).toHaveLength(0);
  });

  it("refuses a request routed to the wrong operation", async () => {
    const baseUrl = await startStub((_request, respond) =>
      respond(200, jsonResponse(PLAN_BODY)),
    );

    const code = await codeFor(
      adapter(baseUrl).createRoadmap(
        buildRequest({ operation: "create_seven_day_plan" }),
      ),
    );

    expect(code).toBe("invalid_input");
    expect(received).toHaveLength(0);
  });
});
