import { describe, expect, it, vi } from "vitest";

import {
  MemoryAuthenticationError,
  MemoryConflictError,
  MemoryPersistenceError,
  MemoryRepository,
} from "./memory-repository";
import { MemoryValidationError } from "@/server/memory/memory-records";

const USER_ID = "53000000-0000-4000-8000-000000000001";
const ITEM_ID = "53000000-0000-4000-8000-0000000000b1";
const REVISION_ID = "53000000-0000-4000-8000-0000000000a1";

describe("MemoryRepository writes", () => {
  it("authenticates, supplies no owner, and disables mutation retry", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: {
        item_id: ITEM_ID,
        collection_revision: 1,
        revision_number: 1,
        result: "created",
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new MemoryRepository(client({ rpc }));

    await repository.create("constraint", "  No pool this month.  ", "", 0);

    expect(rpc).toHaveBeenCalledWith(
      "apply_memory_change",
      expect.not.objectContaining({ user_id: expect.anything() }),
    );
    expect(rpc).toHaveBeenCalledWith("apply_memory_change", {
      p_expected_collection_revision: 0,
      p_operation: "create",
      p_memory_type: "constraint",
      p_content: "No pool this month.",
    });
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("sends edit-and-accept as its own operation", async () => {
    const rpc = vi.fn().mockReturnValue({
      retry: vi
        .fn()
        .mockResolvedValue({ data: { result: "accepted" }, error: null }),
    });
    const repository = new MemoryRepository(client({ rpc }));

    await repository.edit(ITEM_ID, "Confirmed text.", "2026-12-31", 4, true);

    expect(rpc).toHaveBeenCalledWith("apply_memory_change", {
      p_expected_collection_revision: 4,
      p_operation: "edit_and_accept",
      p_item_id: ITEM_ID,
      p_content: "Confirmed text.",
      p_expires_on: "2026-12-31",
    });
  });

  it.each(["accept", "reject", "disable", "enable", "delete"] as const)(
    "sends %s with no content and no review date",
    async (operation) => {
      const rpc = vi.fn().mockReturnValue({
        retry: vi
          .fn()
          .mockResolvedValue({ data: { result: operation }, error: null }),
      });
      const repository = new MemoryRepository(client({ rpc }));

      await repository.transition(operation, ITEM_ID, 2);

      expect(rpc).toHaveBeenCalledWith("apply_memory_change", {
        p_expected_collection_revision: 2,
        p_operation: operation,
        p_item_id: ITEM_ID,
      });
    },
  );

  it("maps the deliberate PT409 conflict", async () => {
    const repository = new MemoryRepository(
      client({
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "PT409",
              message: "Memory changed. Reload and try again.",
            },
          }),
        }),
      }),
    );

    await expect(repository.transition("disable", ITEM_ID, 1)).rejects.toThrow(
      MemoryConflictError,
    );
  });

  it("maps a rejected database validation without echoing the row", async () => {
    const repository = new MemoryRepository(
      client({
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "22023", message: "Invalid memory change." },
          }),
        }),
      }),
    );

    await expect(
      repository.create("preference", "Prefers Sundays off.", "", 0),
    ).rejects.toThrow(MemoryValidationError);
  });

  it("does not forward a database error message", async () => {
    const repository = new MemoryRepository(
      client({
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "23514",
              message:
                'new row for relation "memory_revisions" violates check: content = (Knee pain on stairs.)',
            },
          }),
        }),
      }),
    );

    await expect(
      repository.create("profile_fact", "Knee pain on stairs.", "", 0),
    ).rejects.toThrow(MemoryPersistenceError);
    await expect(
      repository.create("profile_fact", "Knee pain on stairs.", "", 0),
    ).rejects.not.toThrow(/Knee pain/);
  });

  it("rejects malformed input before authenticating or calling the database", async () => {
    const auth = { getClaims: vi.fn() };
    const rpc = vi.fn();
    const repository = new MemoryRepository(client({ auth, rpc }));

    await expect(
      repository.create("recipe", "Anything.", "", 0),
    ).rejects.toThrow(MemoryValidationError);
    await expect(repository.create("preference", "   ", "", 0)).rejects.toThrow(
      MemoryValidationError,
    );
    await expect(
      repository.transition("delete", "not-a-uuid", 0),
    ).rejects.toThrow(MemoryValidationError);
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not call the RPC for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new MemoryRepository(
      client({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: null },
            error: new Error("no session"),
          }),
        },
        rpc,
      }),
    );

    await expect(
      repository.create("preference", "Prefers Sundays off.", "", 0),
    ).rejects.toThrow(MemoryAuthenticationError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("MemoryRepository reads", () => {
  it("scopes every read to the verified owner and assembles history", async () => {
    const collections = table({ data: { revision: 7 }, error: null }, true);
    const items = table({
      data: [
        {
          id: ITEM_ID,
          memory_type: "observed_pattern",
          status: "active",
          provenance: "inferred_proposed",
          confidence: 70,
          source_reference: "seeded:test",
          expires_on: null,
          current_revision_id: "revision-2",
          user_confirmed_at: "2026-08-01T10:00:00.000Z",
          created_at: "2026-08-01T09:00:00.000Z",
          updated_at: "2026-08-01T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const revisions = table({
      data: [
        {
          id: "revision-2",
          item_id: ITEM_ID,
          revision_number: 2,
          content: "Needs an easy day after two hard sessions.",
          author_class: "user",
          provenance: "user_created",
          change_kind: "edited_and_accepted",
          status_after: "active",
          created_at: "2026-08-01T10:00:00.000Z",
        },
        {
          id: REVISION_ID,
          item_id: ITEM_ID,
          revision_number: 1,
          content: "Recovers slowly after two hard sessions.",
          author_class: "system",
          provenance: "inferred_proposed",
          change_kind: "created",
          status_after: "proposed",
          created_at: "2026-08-01T09:00:00.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn((name: string) =>
      name === "memory_collections"
        ? collections.builder
        : name === "memory_items"
          ? items.builder
          : revisions.builder,
    );
    const repository = new MemoryRepository(client({ from }));

    const collection = await repository.list("2026-08-01");

    expect(collections.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(items.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(revisions.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(collection.revision).toBe(7);
    expect(collection.items).toHaveLength(1);
    expect(collection.items[0]).toMatchObject({
      content: "Needs an easy day after two hard sessions.",
      revisionNumber: 2,
      provenance: "inferred_proposed",
      confidence: 70,
    });
    // The original inference stays inspectable as an inference.
    expect(collection.items[0].history).toHaveLength(2);
    expect(collection.items[0].history[1]).toMatchObject({
      authorClass: "system",
      provenance: "inferred_proposed",
      content: "Recovers slowly after two hard sessions.",
    });
  });

  it("fails rather than rendering an item whose current revision is missing", async () => {
    const from = vi.fn((name: string) =>
      name === "memory_collections"
        ? table({ data: { revision: 1 }, error: null }, true).builder
        : name === "memory_items"
          ? table({
              data: [
                {
                  id: ITEM_ID,
                  memory_type: "preference",
                  status: "active",
                  provenance: "user_created",
                  confidence: null,
                  source_reference: null,
                  expires_on: null,
                  current_revision_id: "missing",
                  user_confirmed_at: null,
                  created_at: "2026-08-01T09:00:00.000Z",
                  updated_at: "2026-08-01T09:00:00.000Z",
                },
              ],
              error: null,
            }).builder
          : table({ data: [], error: null }).builder,
    );
    const repository = new MemoryRepository(client({ from }));

    await expect(repository.list("2026-08-01")).rejects.toThrow(
      MemoryPersistenceError,
    );
  });

  it("reports a read failure without any row detail", async () => {
    const from = vi.fn((name: string) =>
      name === "memory_collections"
        ? table(
            { data: null, error: { message: "Knee pain on stairs." } },
            true,
          ).builder
        : table({ data: [], error: null }).builder,
    );
    const repository = new MemoryRepository(client({ from }));

    await expect(repository.list("2026-08-01")).rejects.toThrow(
      "The memory operation could not be completed.",
    );
  });
});

function table(result: unknown, single = false) {
  const eq = vi.fn();
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq,
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  eq.mockImplementation(() => builder);
  if (single) delete builder.then;
  return { builder, eq };
}

function client(overrides: Record<string, unknown>) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: USER_ID } },
        error: null,
      }),
    },
    ...overrides,
  } as never;
}
