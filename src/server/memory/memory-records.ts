export const MEMORY_TYPES = [
  "profile_fact",
  "constraint",
  "preference",
  "observed_pattern",
] as const;

export const MEMORY_STATUSES = [
  "active",
  "proposed",
  "rejected",
  "archived",
] as const;

export const MEMORY_PROVENANCES = [
  "user_created",
  "intake_confirmed",
  "inferred_proposed",
] as const;

export const MEMORY_CHANGE_KINDS = [
  "created",
  "edited",
  "accepted",
  "edited_and_accepted",
  "rejected",
  "disabled",
  "enabled",
  "renewed",
] as const;

export const MEMORY_CONTENT_MAX_LENGTH = 1000;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type MemoryProvenance = (typeof MEMORY_PROVENANCES)[number];
export type MemoryChangeKind = (typeof MEMORY_CHANGE_KINDS)[number];

export type MemoryRevisionView = {
  id: string;
  revisionNumber: number;
  content: string;
  authorClass: "user" | "system";
  provenance: MemoryProvenance;
  changeKind: MemoryChangeKind;
  statusAfter: MemoryStatus;
  createdAt: string;
};

export type MemoryItemView = {
  id: string;
  memoryType: MemoryType;
  status: MemoryStatus;
  provenance: MemoryProvenance;
  confidence: number | null;
  sourceReference: string | null;
  expiresOn: string | null;
  userConfirmedAt: string | null;
  content: string;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  history: MemoryRevisionView[];
};

export type MemoryCollectionView = {
  revision: number;
  today: string;
  items: MemoryItemView[];
};

export class MemoryValidationError extends Error {
  constructor() {
    // Never echoes the submitted text: memory content must not travel in an
    // error message.
    super("The memory details are invalid.");
    this.name = "MemoryValidationError";
  }
}

/**
 * An item whose review date has passed. It keeps its text and its `active`
 * status; it is only excluded from context until the owner renews, edits or
 * disables it. Expiry never converts or deletes anything.
 */
export function isReviewDue(item: MemoryItemView, today: string): boolean {
  return (
    item.status === "active" &&
    item.expiresOn !== null &&
    item.expiresOn < today
  );
}

/**
 * The only memory a later approved coaching ticket may read. Proposed,
 * rejected, disabled and review-due items are all excluded.
 */
export function selectActiveMemoryContext(
  items: MemoryItemView[],
  today: string,
): MemoryItemView[] {
  return items.filter(
    (item) => item.status === "active" && !isReviewDue(item, today),
  );
}

/** The owner's date used to decide review-due. See the validation record. */
export function utcIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseMemoryContent(value: unknown): string {
  if (typeof value !== "string") throw new MemoryValidationError();
  const clean = value.trim();
  if (clean.length < 1 || clean.length > MEMORY_CONTENT_MAX_LENGTH) {
    throw new MemoryValidationError();
  }
  return clean;
}

export function parseMemoryType(value: unknown): MemoryType {
  if (
    typeof value !== "string" ||
    !MEMORY_TYPES.includes(value as MemoryType)
  ) {
    throw new MemoryValidationError();
  }
  return value as MemoryType;
}

export function parseMemoryId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new MemoryValidationError();
  }
  return value;
}

export function parseExpectedRevision(value: unknown): number {
  const parsed =
    typeof value === "string" && value !== "" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new MemoryValidationError();
  }
  return parsed;
}

export function parseOptionalReviewDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new MemoryValidationError();
  }
  return value;
}
