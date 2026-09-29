import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Why a session was cancelled is stored only (owner, 29 Sep 2026): no coach
 * reads it, and letting one would be its own ADR-013 step. The migration keeps
 * it in its own table, out of the plan read and out of every snapshot; this
 * keeps the code's reach to it as narrow as the data's.
 *
 * One repository names the table, and only the session's own page and the
 * action that edits the reason import that repository. A coach context, a
 * proposal, or any other read that wanted the reason would have to change
 * this list first — which is the point at which the ADR question is asked.
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

  it("is read only by the session's page and edited only by its action", () => {
    const importing = sourceFiles(SRC).filter((path) =>
      readFileSync(path, "utf8").includes(REPOSITORY),
    );

    expect(importing.sort()).toEqual(
      [
        join(SRC, "app", "home", "plan", "cancellation-actions.ts"),
        join(SRC, "app", "home", "plan", "session", "[id]", "page.tsx"),
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
