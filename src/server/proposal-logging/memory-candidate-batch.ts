import "server-only";

/**
 * Why a coaching route's memory candidate batch was not recorded — by code only.
 *
 * Both generation paths swallow the batch's failure on purpose (ADR-015: one
 * memory conflict must not roll back a valid proposal). Swallowed silently,
 * though, a coach that invented an excerpt (`22023`) looks exactly like a
 * genuine conflict (`PT409`), and that code is the only signal there would be
 * if the TypeScript and SQL owner-text normalizers ever skew
 * (`src/server/ai/owner-text.ts`).
 *
 * ADR-010 decision 15 keeps memory content out of logs, so nothing but a
 * SQLSTATE or an error class name ever reaches one. The database message is
 * never read: it can quote the excerpt.
 *
 * It lives in its own directory on purpose. `src/server/memory` and
 * `src/server/ai` forbid the console outright (`memory-privacy.test.ts`,
 * `ai-privacy.test.ts`), and they should keep doing so: this is the one log
 * line the owner approved on 28 September 2026, and the test beside it pins
 * this file as the only one in `src` that may write to the console.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;
const ERROR_CLASS_NAME = /^[A-Za-z]{1,64}Error$/;

/** The RPC refused the batch; `code` is its SQLSTATE and nothing else. */
export class MemoryCandidateBatchError extends Error {
  readonly code: string;

  constructor(code: string | undefined) {
    super("The memory candidates could not be recorded.");
    this.name = "MemoryCandidateBatchError";
    this.code = code && SQLSTATE.test(code) ? code : "unknown";
  }
}

export type MemoryCandidateRoute = "plan" | "roadmap";

/** What a log line may say about `error`: a SQLSTATE, a class name, or neither. */
export function memoryCandidateFailureCode(error: unknown): string {
  if (error instanceof MemoryCandidateBatchError) return error.code;
  if (error instanceof Error && ERROR_CLASS_NAME.test(error.name)) {
    return error.name;
  }
  return "unknown";
}

export function logMemoryCandidateFailure(
  route: MemoryCandidateRoute,
  error: unknown,
): void {
  console.warn(
    `[fittip] ${route} memory candidates not recorded: ${memoryCandidateFailureCode(error)}`,
  );
}
