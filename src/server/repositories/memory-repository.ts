import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import {
  MemoryValidationError,
  parseExpectedRevision,
  parseMemoryContent,
  parseMemoryId,
  parseMemoryType,
  parseOptionalReviewDate,
  utcIsoDate,
  type MemoryChangeKind,
  type MemoryCollectionView,
  type MemoryItemView,
  type MemoryProvenance,
  type MemoryRevisionView,
  type MemoryStatus,
  type MemoryType,
} from "@/server/memory/memory-records";

const ITEM_COLUMNS =
  "id, memory_type, status, provenance, confidence, source_reference, expires_on, current_revision_id, user_confirmed_at, created_at, updated_at" as const;
const REVISION_COLUMNS =
  "id, item_id, revision_number, content, author_class, provenance, change_kind, status_after, created_at" as const;

type MemoryClient = SupabaseClient<Database> | ServerUserClient;
type ItemRow = Pick<
  Database["public"]["Tables"]["memory_items"]["Row"],
  | "id"
  | "memory_type"
  | "status"
  | "provenance"
  | "confidence"
  | "source_reference"
  | "expires_on"
  | "current_revision_id"
  | "user_confirmed_at"
  | "created_at"
  | "updated_at"
>;
type RevisionRow = Pick<
  Database["public"]["Tables"]["memory_revisions"]["Row"],
  | "id"
  | "item_id"
  | "revision_number"
  | "content"
  | "author_class"
  | "provenance"
  | "change_kind"
  | "status_after"
  | "created_at"
>;

/** Operations that carry no content and no review date. */
export type MemoryStatusOperation =
  | "accept"
  | "reject"
  | "disable"
  | "enable"
  | "delete";

export class MemoryAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "MemoryAuthenticationError";
  }
}

export class MemoryPersistenceError extends Error {
  constructor() {
    // Deliberately generic. A database error message can contain the row that
    // failed, so it is never forwarded.
    super("The memory operation could not be completed.");
    this.name = "MemoryPersistenceError";
  }
}

export class MemoryConflictError extends Error {
  constructor() {
    super("The memory collection changed before this save.");
    this.name = "MemoryConflictError";
  }
}

export class MemoryRepository {
  constructor(private readonly client: MemoryClient) {}

  async list(today: string = utcIsoDate()): Promise<MemoryCollectionView> {
    const userId = await this.getVerifiedUserId();
    // Three independent owner-scoped reads, issued together rather than in a
    // waterfall.
    const [
      { data: head, error: headError },
      { data: itemRows, error: itemError },
      { data: revisionRows, error: revisionError },
    ] = await Promise.all([
      this.client
        .from("memory_collections")
        .select("revision")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("memory_items")
        .select(ITEM_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      this.client
        .from("memory_revisions")
        .select(REVISION_COLUMNS)
        .eq("user_id", userId)
        .order("revision_number", { ascending: false }),
    ]);
    if (headError || itemError || revisionError) {
      throw new MemoryPersistenceError();
    }

    const historyByItem = new Map<string, MemoryRevisionView[]>();
    for (const row of revisionRows) {
      const history = historyByItem.get(row.item_id);
      const revision = toRevision(row);
      if (history) history.push(revision);
      else historyByItem.set(row.item_id, [revision]);
    }

    const items: MemoryItemView[] = [];
    for (const row of itemRows) {
      const history = historyByItem.get(row.id) ?? [];
      const current = history.find(
        (revision) => revision.id === row.current_revision_id,
      );
      // An item without its current revision is not renderable and must not be
      // shown with someone else's text or an invented placeholder.
      if (!current) throw new MemoryPersistenceError();
      items.push(toItem(row, current, history));
    }

    return { revision: head?.revision ?? 0, today, items };
  }

  async create(
    memoryType: unknown,
    content: unknown,
    reviewDate: unknown,
    expectedRevision: unknown,
  ) {
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: "create",
      p_memory_type: parseMemoryType(memoryType),
      p_content: parseMemoryContent(content),
      ...reviewDateArg(reviewDate),
    });
  }

  async edit(
    id: unknown,
    content: unknown,
    reviewDate: unknown,
    expectedRevision: unknown,
    accept = false,
  ) {
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: accept ? "edit_and_accept" : "edit",
      p_item_id: parseMemoryId(id),
      p_content: parseMemoryContent(content),
      ...reviewDateArg(reviewDate),
    });
  }

  async renew(id: unknown, reviewDate: unknown, expectedRevision: unknown) {
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: "renew",
      p_item_id: parseMemoryId(id),
      ...reviewDateArg(reviewDate),
    });
  }

  async transition(
    operation: MemoryStatusOperation,
    id: unknown,
    expectedRevision: unknown,
  ) {
    return this.call({
      p_expected_collection_revision: parseExpectedRevision(expectedRevision),
      p_operation: operation,
      p_item_id: parseMemoryId(id),
    });
  }

  private async call(
    args: Database["public"]["Functions"]["apply_memory_change"]["Args"],
  ) {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_memory_change", args)
      .retry(false);
    if (error) {
      if (error.code === "PT409") throw new MemoryConflictError();
      if (error.code === "22023") throw new MemoryValidationError();
      throw new MemoryPersistenceError();
    }
    if (!data) throw new MemoryPersistenceError();
    return data;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new MemoryAuthenticationError(error);
      }
      throw new MemoryAuthenticationError();
    }
  }
}

export async function createMemoryRepository(): Promise<MemoryRepository> {
  return new MemoryRepository(await createServerUserClient());
}

function reviewDateArg(value: unknown): { p_expires_on?: string } {
  const reviewDate = parseOptionalReviewDate(value);
  return reviewDate === undefined ? {} : { p_expires_on: reviewDate };
}

function toRevision(row: RevisionRow): MemoryRevisionView {
  return {
    id: row.id,
    revisionNumber: row.revision_number,
    content: row.content,
    authorClass: row.author_class as MemoryRevisionView["authorClass"],
    provenance: row.provenance as MemoryProvenance,
    changeKind: row.change_kind as MemoryChangeKind,
    statusAfter: row.status_after as MemoryStatus,
    createdAt: row.created_at,
  };
}

function toItem(
  row: ItemRow,
  current: MemoryRevisionView,
  history: MemoryRevisionView[],
): MemoryItemView {
  return {
    id: row.id,
    memoryType: row.memory_type as MemoryType,
    status: row.status as MemoryStatus,
    provenance: row.provenance as MemoryProvenance,
    confidence: row.confidence,
    sourceReference: row.source_reference,
    expiresOn: row.expires_on,
    userConfirmedAt: row.user_confirmed_at,
    content: current.content,
    revisionNumber: current.revisionNumber,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history,
  };
}
