import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRepositoryMock, revalidatePathMock } = vi.hoisted(() => ({
  createRepositoryMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/memory-repository", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/server/repositories/memory-repository")
    >();
  return { ...actual, createMemoryRepository: createRepositoryMock };
});

import { INITIAL_MEMORY_ACTION_STATE } from "@/app/home/you/memory/action-state";
import { changeMemoryAction } from "@/app/home/you/memory/actions";
import {
  MemoryConflictError,
  MemoryPersistenceError,
  MemoryRepository,
} from "@/server/repositories/memory-repository";

/**
 * A distinctive health-adjacent sentence. Nothing outside the owner's own
 * screen may ever repeat it.
 */
const SENSITIVE = "Sharp left knee pain on stairs since 12 July.";

const MEMORY_SOURCE_DIRECTORIES = [
  join(process.cwd(), "src", "server", "memory"),
  join(process.cwd(), "src", "components", "memory"),
  join(process.cwd(), "src", "app", "home", "you", "memory"),
];

const MEMORY_SOURCE_FILES = [
  ...MEMORY_SOURCE_DIRECTORIES.flatMap(sourceFiles),
  join(process.cwd(), "src", "server", "repositories", "memory-repository.ts"),
].filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  consoleSpies = (
    ["log", "info", "warn", "error", "debug", "trace"] as const
  ).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  consoleSpies = [];
});

describe("memory content never leaves the owner's own screen", () => {
  it("routes no memory module through the console", () => {
    expect(MEMORY_SOURCE_FILES.length).toBeGreaterThan(4);
    for (const path of MEMORY_SOURCE_FILES) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\bconsole\s*\./);
    }
  });

  it.each([
    ["conflict", new MemoryConflictError()],
    ["persistence", new MemoryPersistenceError()],
    [
      "database",
      Object.assign(new Error(`check failed: content = (${SENSITIVE})`), {
        code: "23514",
      }),
    ],
  ])("logs nothing and says nothing on a %s failure", async (_kind, thrown) => {
    createRepositoryMock.mockResolvedValue({
      create: vi.fn().mockRejectedValue(thrown),
    });

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      createForm(),
    );

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(result.message).not.toContain(SENSITIVE);
    expect(result.status).not.toBe("idle");
    // The owner's text comes back only in their own draft, so a rejected save
    // does not throw their words away.
    expect(result.draft?.content).toBe(SENSITIVE);
    expect(JSON.stringify({ ...result, draft: undefined })).not.toContain(
      "knee",
    );
  });

  it("keeps a successful receipt free of memory content", async () => {
    const create = vi.fn().mockResolvedValue({
      item_id: "53000000-0000-4000-8000-0000000000b1",
      collection_revision: 1,
      revision_number: 1,
      result: "created",
    });
    createRepositoryMock.mockResolvedValue({ create });

    const result = await changeMemoryAction(
      INITIAL_MEMORY_ACTION_STATE,
      createForm(),
    );

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("knee");
    expect(result).toMatchObject({ status: "saved", draft: undefined });
  });

  it("keeps memory content out of a repository failure it reports", async () => {
    const repository = new MemoryRepository({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "53000000-0000-4000-8000-000000000001" } },
          error: null,
        }),
      },
      rpc: vi.fn().mockReturnValue({
        retry: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "23514", message: `content = (${SENSITIVE})` },
        }),
      }),
    } as never);

    const failure = await repository
      .create("profile_fact", SENSITIVE, "", 0)
      .then(
        () => null,
        (error: Error) => error,
      );

    expect(failure).toBeInstanceOf(MemoryPersistenceError);
    expect(`${failure?.message}${failure?.stack ?? ""}`).not.toContain("knee");
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

function createForm() {
  const form = new FormData();
  form.set("operation", "create");
  form.set("expectedRevision", "0");
  form.set("memoryType", "profile_fact");
  form.set("content", SENSITIVE);
  form.set("reviewDate", "");
  return form;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
