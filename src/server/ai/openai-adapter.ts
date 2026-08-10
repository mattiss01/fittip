import "server-only";

import type {
  CoachAI,
  CoachAICandidate,
  CoachAIOperation,
  CoachAIRequest,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import {
  buildCoachAIMessages,
  COACH_AI_RESPONSE_SCHEMAS,
} from "@/server/ai/openai-prompt";

/**
 * The one approved real-provider adapter (M3-01B decision 1: OpenAI,
 * `gpt-5.6-luna`).
 *
 * It is the only module in `src/server/ai` permitted to reach the network, and
 * `src/architecture/coach-ai-network-gate.test.ts` fails if that stops being
 * true. Everything it is given is already authorized: the domain service owns
 * the live enablement gate, context selection, limits, validation, and the
 * decision that the result stays a proposal. This adapter turns one authorized
 * request into one HTTP call and returns an untrusted body.
 *
 * **No provider SDK.** Decision 5 requires zero automatic retries with the
 * SDK's own retry policy explicitly off, and SDKs commonly retry by default, so
 * leaving that unset is a decision made by omission. Calling `fetch` directly
 * is the strongest available form of "off": there is no retry policy to
 * misconfigure, and this module issues exactly one request per call. It also
 * avoids adding a dependency, which would be a supply-chain change.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Roughly four characters per token. Deliberately an estimate, used only as a
 * refusal guard — the authoritative ceiling is the byte budget the context
 * assembly already enforces. */
const CHARACTERS_PER_TOKEN = 4;

type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<Response>;

/**
 * Reported when the provider stopped because it hit the output ceiling.
 *
 * This exists because a truncated response and a response that simply failed
 * the schema are indistinguishable downstream, and the 9 August 2026 bake-off
 * spent sixteen billed calls learning that the hard way: a reasoning model that
 * exhausted its output budget was reported as "response was not JSON". The
 * candidate cannot carry the signal — `CoachAICandidate` is part of the
 * accepted contract and M3-01B may not widen it — so the adapter surfaces it
 * here instead. A caller that wires this into telemetry can tell the two apart
 * without reconstructing it from token counts.
 */
export type CoachAITruncation = {
  requestId: string;
  operation: CoachAIOperation;
  reportedOutputTokens: number | null;
  maxOutputTokens: number;
};

export type OpenAICoachAIOptions = {
  /**
   * Server-only. Passed in rather than read from the environment here, so the
   * enablement gate stays the single place that decides a credential may be
   * used at all. Never logged, never returned, never placed in an error.
   */
  apiKey: string;
  modelCode: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  onTruncated?: (truncation: CoachAITruncation) => void;
};

export class OpenAICoachAI implements CoachAI {
  readonly kind = "provider" as const;
  readonly providerCode = "openai";
  readonly modelCode: string;

  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #onTruncated: ((truncation: CoachAITruncation) => void) | null;

  constructor(options: OpenAICoachAIOptions) {
    if (
      typeof options.apiKey !== "string" ||
      options.apiKey.trim().length === 0
    ) {
      throw new CoachAIError("credential_unavailable");
    }
    if (
      typeof options.modelCode !== "string" ||
      options.modelCode.trim().length === 0
    ) {
      throw new CoachAIError("provider_unconfigured");
    }

    this.#apiKey = options.apiKey;
    this.modelCode = options.modelCode;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetchImpl ?? (globalThis.fetch as FetchLike);
    this.#onTruncated = options.onTruncated ?? null;
  }

  createRoadmap(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.#call("create_roadmap", request);
  }

  createSevenDayPlan(request: CoachAIRequest): Promise<CoachAICandidate> {
    return this.#call("create_seven_day_plan", request);
  }

  async #call(
    operation: CoachAIOperation,
    request: CoachAIRequest,
  ): Promise<CoachAICandidate> {
    // A request routed to the wrong method is a caller bug, not a provider
    // failure, and must not silently produce a plausible answer.
    if (request.operation !== operation) {
      throw new CoachAIError("invalid_input");
    }

    const messages = buildCoachAIMessages(operation, request.context);
    const estimatedInputTokens = Math.ceil(
      messages.reduce((total, message) => total + message.content.length, 0) /
        CHARACTERS_PER_TOKEN,
    );
    // The provider has no input ceiling parameter, so `maxInputTokens` would be
    // decorative unless it refuses something here. Refusing before the call is
    // also the only version that costs nothing.
    if (estimatedInputTokens > request.maxInputTokens) {
      throw new CoachAIError("context_too_large");
    }

    const body = JSON.stringify({
      model: this.modelCode,
      max_completion_tokens: request.maxOutputTokens,
      response_format: {
        type: "json_schema",
        json_schema: COACH_AI_RESPONSE_SCHEMAS[operation],
      },
      messages,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.deadlineMs);
    let raw: string;
    let status: number;
    try {
      // Exactly one request. There is no retry here and no SDK to retry for us:
      // a call that fails after the provider generated a response has already
      // been billed, and a retry buys a second charge for one proposal.
      const response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      status = response.status;
      // Read inside the same deadline. Clearing the timer before the body
      // arrives would leave a slow-body response able to hang indefinitely.
      raw = await response.text();
    } catch {
      // The raw error can carry the request URL, the headers, and therefore the
      // credential. It is mapped to a code and discarded, never forwarded.
      // Asking the controller whether it aborted is exact, where matching on
      // the rejection's shape depends on which error the runtime happens to
      // throw for a torn-down socket.
      throw new CoachAIError(
        controller.signal.aborted
          ? "deadline_exceeded"
          : "provider_unavailable",
      );
    } finally {
      clearTimeout(timer);
    }

    if (status === 429) throw new CoachAIError("rate_limited");
    if (status === 401 || status === 403) {
      throw new CoachAIError("credential_unavailable");
    }
    if (status < 200 || status >= 300) {
      throw new CoachAIError("provider_unavailable");
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      // A malformed *envelope* is a broken provider. A malformed *proposal*
      // inside a well-formed envelope is the domain service's to reject, so it
      // is passed through untouched below.
      throw new CoachAIError("provider_unavailable");
    }

    const choice = firstChoice(envelope);
    const content = readString(readRecord(choice, "message"), "content");
    if (content === null) {
      // Covers a refusal, a tool call, and a structurally surprising envelope
      // alike. None of them is a candidate.
      throw new CoachAIError("provider_unavailable");
    }

    const usage = readRecord(envelope, "usage");
    const reportedInputTokens = readTokenCount(usage, "prompt_tokens");
    const reportedOutputTokens = readTokenCount(usage, "completion_tokens");

    if (readString(choice, "finish_reason") === "length") {
      // Returned rather than thrown, deliberately. The reported usage is real,
      // so settlement reconciles against what was actually spent instead of
      // charging the whole reservation, and validation rejects the truncated
      // body on its own merits. The signal that it was truncation goes to the
      // caller through `onTruncated`, not through a guess about token counts.
      this.#onTruncated?.({
        requestId: request.requestId,
        operation,
        reportedOutputTokens,
        maxOutputTokens: request.maxOutputTokens,
      });
    }

    return { body: content, reportedInputTokens, reportedOutputTokens };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function firstChoice(envelope: unknown): Record<string, unknown> | null {
  if (!isRecord(envelope)) return null;
  const choices = envelope.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  return isRecord(choices[0]) ? choices[0] : null;
}

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  if (value === null) return null;
  const found = value[key];
  return typeof found === "string" ? found : null;
}

/** Unknown usage stays `null`. A provider that reported nothing did not report zero. */
function readTokenCount(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  if (value === null) return null;
  const found = value[key];
  return typeof found === "number" && Number.isSafeInteger(found) && found >= 0
    ? found
    : null;
}
