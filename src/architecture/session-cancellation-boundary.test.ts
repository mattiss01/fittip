import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Why a session was cancelled was stored only (owner, 29 Sep 2026), and
 * letting a coach read it would be its own ADR-013 step. On 17 Oct 2026 the
 * owner took that step: the coach's context reads the reasons of sessions
 * called off ahead (ADR-013 seventh amendment), after Sarah's trip days were
 * refilled. The migration still keeps the reason in its own table, out of the
 * plan read and out of every snapshot; this keeps the code's reach to it as
 * narrow as the data's.
 *
 * One repository names the table, and only the session's own page, the
 * action that edits the reason, and the coach's context source import that
 * repository. Any other read that wanted the reason would have to change this
 * list first — which is the point at which the ADR question is asked.
 */

const SRC = join(process.cwd(), "src");
const TABLE = "rolling_plan_session_cancellations";
const REPOSITORY = "@/server/repositories/session-cancellation-repository";

describe("the cancellation reason", () => {
  it("is named by one repository and the generated types, and nothing else", () => {
    const naming = sourceFiles(SRC).filter((path) =>
      readFileSync(path, "utf8").includes(TABLE),
    );

    expect(naming.sort()).toEqual(
      [
        join(SRC, "lib", "supabase", "database.types.ts"),
        join(
          SRC,
          "server",
          "repositories",
          "session-cancellation-repository.ts",
        ),
      ].sort(),
    );
  });

  it("is read only by the session's page and the coach's context, and edited only by its action", () => {
    const importing = sourceFiles(SRC).filter((path) =>
      readFileSync(path, "utf8").includes(REPOSITORY),
    );

    expect(importing.sort()).toEqual(
      [
        join(SRC, "app", "home", "plan", "cancellation-actions.ts"),
        join(SRC, "app", "home", "plan", "session", "[id]", "page.tsx"),
        join(SRC, "server", "context", "coach-ai-context-source.ts"),
      ].sort(),
    );
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) &&
      !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}
