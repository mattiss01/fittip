import "server-only";

import type { ServerUserClient } from "@/lib/supabase/server-user-client";

/** A suggestion the coach made from a planning note, still undecided. */
export type OpenMemorySuggestion = {
  id: string;
  /** The proposal it came from, read from its source reference. */
  proposalId: string | null;
  memoryType: "profile_fact" | "constraint" | "preference" | "observed_pattern";
  content: string;
};

export type OpenMemorySuggestions = {
  /** The memory collection's revision, which Accept and Reject must name. */
  revision: number;
  suggestions: OpenMemorySuggestion[];
};

/**
 * The proposed memory items from one kind of coach proposal, oldest first,
 * with their current words (owner, 19 Oct 2026: decided inside the review).
 * `sourcePrefix` is `plan-proposal:` or `roadmap-proposal:`, the reference the
 * record functions write. Read-only, owner-scoped on every query; the
 * decision itself goes through `apply_memory_change` like any other.
 *
 * Returns null when a read fails, for the caller to map to its own error.
 */
export async function readOpenMemorySuggestions(
  client: ServerUserClient,
  userId: string,
  sourcePrefix: "plan-proposal:" | "roadmap-proposal:",
): Promise<OpenMemorySuggestions | null> {
  const [{ data: head, error: headError }, { data: items, error: itemError }] =
    await Promise.all([
      client
        .from("memory_collections")
        .select("revision")
        .eq("user_id", userId)
        .maybeSingle(),
      client
        .from("memory_items")
        .select("id, memory_type, current_revision_id, source_reference")
        .eq("user_id", userId)
        .eq("status", "proposed")
        .like("source_reference", `${sourcePrefix}%`)
        .order("created_at", { ascending: true }),
    ]);
  if (headError || itemError) return null;

  const revisionIds = items
    .map((item) => item.current_revision_id)
    .filter((id): id is string => id !== null);
  if (revisionIds.length === 0) {
    return { revision: head?.revision ?? 0, suggestions: [] };
  }
  const { data: revisions, error: revisionError } = await client
    .from("memory_revisions")
    .select("id, content")
    .eq("user_id", userId)
    .in("id", revisionIds);
  if (revisionError) return null;

  const contentById = new Map(
    revisions.map((revision) => [revision.id, revision.content]),
  );
  return {
    revision: head?.revision ?? 0,
    suggestions: items.flatMap((item) => {
      const content =
        item.current_revision_id === null
          ? undefined
          : contentById.get(item.current_revision_id);
      // An item without its current revision is not renderable.
      return content === undefined
        ? []
        : [
            {
              id: item.id,
              proposalId: item.source_reference?.split(":")[1] ?? null,
              memoryType:
                item.memory_type as OpenMemorySuggestion["memoryType"],
              content,
            },
          ];
    }),
  };
}
