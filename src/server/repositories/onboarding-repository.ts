import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  requireAllowedVerifiedUser,
  VerifiedUserAccessError,
} from "@/lib/auth/verified-user";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  createServerUserClient,
  type ServerUserClient,
} from "@/lib/supabase/server-user-client";
import type {
  CandidateComparison,
  GoalCandidateView,
  MemoryCandidateView,
  OnboardingDraftView,
  OnboardingSnapshot,
  OnboardingStep,
  OnboardingResolution,
  TrainingActivityDraft,
} from "@/server/onboarding/onboarding-records";

type OnboardingClient = SupabaseClient<Database> | ServerUserClient;
type DraftRow = Database["public"]["Tables"]["onboarding_drafts"]["Row"];
type ActivityRow =
  Database["public"]["Tables"]["onboarding_training_activities"]["Row"];
type GoalCandidateRow =
  Database["public"]["Tables"]["onboarding_goal_candidates"]["Row"];
type MemoryCandidateRow =
  Database["public"]["Tables"]["onboarding_memory_candidates"]["Row"];
type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type MemoryItemRow = Database["public"]["Tables"]["memory_items"]["Row"];
type MemoryRevisionRow =
  Database["public"]["Tables"]["memory_revisions"]["Row"];

const GOAL_COLUMNS =
  "id, title, desired_outcome, category, activity_areas, start_date, target_date, target_detail, target_metric_label, target_metric_value, target_metric_unit, priority_tier, active_rank, rationale, constraints_text, archived_at" as const;
const MEMORY_ITEM_COLUMNS =
  "id, memory_type, status, provenance, intake_field_key, current_revision_id" as const;
const MEMORY_REVISION_COLUMNS =
  "id, item_id, content, revision_number" as const;

export type OnboardingOperation =
  | "start"
  | "dismiss_prompt"
  | "save_goals"
  | "save_training"
  | "save_context"
  | "save_preferences"
  | "save_constraints"
  | "save_review"
  | "cancel"
  | "publish";

export class OnboardingAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "OnboardingAuthenticationError";
  }
}

export class OnboardingPersistenceError extends Error {
  constructor() {
    super("The guided setup operation could not be completed.");
    this.name = "OnboardingPersistenceError";
  }
}

export class OnboardingConflictError extends Error {
  constructor() {
    super("Guided setup changed before this save.");
    this.name = "OnboardingConflictError";
  }
}

export class OnboardingDatabaseValidationError extends Error {
  constructor() {
    super("The guided setup details were rejected.");
    this.name = "OnboardingDatabaseValidationError";
  }
}

export class OnboardingRepository {
  constructor(private readonly client: OnboardingClient) {}

  async load(): Promise<OnboardingSnapshot> {
    const userId = await this.getVerifiedUserId();
    const now = new Date().toISOString();
    const [
      draftResult,
      activityResult,
      goalCandidateResult,
      memoryCandidateResult,
      promptResult,
      publicationResult,
      goalHeadResult,
      goalResult,
      memoryHeadResult,
      memoryItemResult,
      memoryRevisionResult,
    ] = await Promise.all([
      this.client
        .from("onboarding_drafts")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", now)
        .maybeSingle(),
      this.client
        .from("onboarding_training_activities")
        .select("*")
        .eq("user_id", userId)
        .order("position"),
      this.client
        .from("onboarding_goal_candidates")
        .select("*")
        .eq("user_id", userId)
        .order("position"),
      this.client
        .from("onboarding_memory_candidates")
        .select("*")
        .eq("user_id", userId)
        .order("position")
        .order("field_key"),
      this.client
        .from("onboarding_prompt_states")
        .select("dismissed_at")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("onboarding_publication_receipts")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
      this.client
        .from("goal_collections")
        .select("revision")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("goals")
        .select(GOAL_COLUMNS)
        .eq("user_id", userId)
        .is("archived_at", null),
      this.client
        .from("memory_collections")
        .select("revision")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("memory_items")
        .select(MEMORY_ITEM_COLUMNS)
        .eq("user_id", userId),
      this.client
        .from("memory_revisions")
        .select(MEMORY_REVISION_COLUMNS)
        .eq("user_id", userId),
    ]);

    const results = [
      draftResult,
      activityResult,
      goalCandidateResult,
      memoryCandidateResult,
      promptResult,
      publicationResult,
      goalHeadResult,
      goalResult,
      memoryHeadResult,
      memoryItemResult,
      memoryRevisionResult,
    ];
    if (results.some((result) => result.error)) {
      throw new OnboardingPersistenceError();
    }

    const draft = draftResult.data;
    const goalRows = goalResult.data as GoalRow[];
    const memoryItems = memoryItemResult.data as MemoryItemRow[];
    const revisions = memoryRevisionResult.data as MemoryRevisionRow[];
    const currentRevisionById = new Map(
      revisions.map((revision) => [revision.id, revision]),
    );

    return {
      draft: draft ? toDraft(draft) : null,
      activities: draft
        ? (activityResult.data as ActivityRow[])
            .filter((row) => row.draft_id === draft.id)
            .map(toActivity)
        : [],
      goalCandidates: draft
        ? (goalCandidateResult.data as GoalCandidateRow[])
            .filter((row) => row.draft_id === draft.id)
            .map((row) => toGoalCandidate(row, goalRows))
        : [],
      memoryCandidates: draft
        ? (memoryCandidateResult.data as MemoryCandidateRow[])
            .filter((row) => row.draft_id === draft.id)
            .map((row) =>
              toMemoryCandidate(row, memoryItems, currentRevisionById),
            )
        : [],
      goalRevision: goalHeadResult.data?.revision ?? 0,
      memoryRevision: memoryHeadResult.data?.revision ?? 0,
      activeGoalOrder: goalRows
        .filter(
          (goal) =>
            goal.active_rank !== null &&
            (goal.priority_tier === "core" ||
              goal.priority_tier === "supporting"),
        )
        .map((goal) => ({
          id: goal.id,
          title: goal.title,
          priorityTier: goal.priority_tier as "core" | "supporting",
          activeRank: goal.active_rank!,
        }))
        .sort(
          (left, right) =>
            left.priorityTier.localeCompare(right.priorityTier) ||
            left.activeRank - right.activeRank,
        ),
      promptDismissed: promptResult.data !== null,
      hasPublished: (publicationResult.data?.length ?? 0) > 0,
    };
  }

  async getEntryState(): Promise<{
    showHomeInvitation: boolean;
  }> {
    const userId = await this.getVerifiedUserId();
    const [prompt, publication] = await Promise.all([
      this.client
        .from("onboarding_prompt_states")
        .select("dismissed_at")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client
        .from("onboarding_publication_receipts")
        .select("id")
        .eq("user_id", userId)
        .limit(1),
    ]);
    if (prompt.error || publication.error) {
      throw new OnboardingPersistenceError();
    }
    return {
      showHomeInvitation: prompt.data === null && publication.data.length === 0,
    };
  }

  async apply(args: {
    operation: OnboardingOperation;
    expectedDraftRevision: number;
    payload?: Json;
    expectedGoalRevision?: number;
    expectedMemoryRevision?: number;
    idempotencyKey?: string;
  }) {
    await this.getVerifiedUserId();
    const { data, error } = await this.client
      .rpc("apply_onboarding_change", {
        p_expected_draft_revision: args.expectedDraftRevision,
        p_operation: args.operation,
        p_payload: args.payload ?? {},
        ...(args.expectedGoalRevision === undefined
          ? {}
          : { p_expected_goal_revision: args.expectedGoalRevision }),
        ...(args.expectedMemoryRevision === undefined
          ? {}
          : { p_expected_memory_revision: args.expectedMemoryRevision }),
        ...(args.idempotencyKey === undefined
          ? {}
          : { p_idempotency_key: args.idempotencyKey }),
      })
      .retry(false);

    if (error) {
      if (error.code === "PT409" || error.code === "55P03") {
        throw new OnboardingConflictError();
      }
      if (
        error.code === "22023" ||
        error.code === "23514" ||
        error.code === "23505"
      ) {
        throw new OnboardingDatabaseValidationError();
      }
      throw new OnboardingPersistenceError();
    }
    if (!data) throw new OnboardingPersistenceError();
    return data;
  }

  private async getVerifiedUserId(): Promise<string> {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new OnboardingAuthenticationError(error);
      }
      throw new OnboardingAuthenticationError();
    }
  }
}

export async function createOnboardingRepository() {
  return new OnboardingRepository(await createServerUserClient());
}

function toDraft(row: DraftRow): OnboardingDraftView {
  return {
    id: row.id,
    revision: row.revision,
    currentStep: row.current_step as OnboardingStep,
    trainingStatus:
      row.training_status as OnboardingDraftView["trainingStatus"],
    availableDays: row.available_days,
    sessionsPerWeek: row.sessions_per_week,
    sessionDurationMinutes: row.session_duration_minutes,
    accessLabels: row.access_labels,
    timezoneName: row.timezone_name,
    units: row.units_system as OnboardingDraftView["units"],
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
  };
}

function toActivity(row: ActivityRow): TrainingActivityDraft {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    sessionsPerWeek: row.sessions_per_week,
    durationMinutes: row.duration_minutes,
    detail: row.detail,
  };
}

function toGoalCandidate(
  row: GoalCandidateRow,
  goals: GoalRow[],
): GoalCandidateView {
  const orderedGoals = [...goals].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const exact = orderedGoals.find((goal) => goalMatches(row, goal));
  const conflict =
    exact ??
    orderedGoals.find(
      (goal) =>
        goal.title.trim().toLocaleLowerCase() === row.title.toLocaleLowerCase(),
    );
  const comparison: CandidateComparison = exact
    ? {
        kind: "exact",
        targetId: exact.id,
        existingLabel: exact.title,
        existingDetail: exact.desired_outcome,
        existingStatus: null,
      }
    : conflict
      ? {
          kind: "conflict",
          targetId: conflict.id,
          existingLabel: conflict.title,
          existingDetail: conflict.desired_outcome,
          existingStatus: null,
        }
      : {
          kind: "new",
          targetId: null,
          existingLabel: null,
          existingDetail: null,
          existingStatus: null,
        };

  return {
    id: row.id,
    position: row.position,
    title: row.title,
    desiredOutcome: row.desired_outcome,
    category: row.category as GoalCandidateView["category"],
    activityAreas: row.activity_areas,
    startDate: row.start_date,
    ...(row.target_date ? { targetDate: row.target_date } : {}),
    ...(row.target_detail ? { targetDetail: row.target_detail } : {}),
    ...(row.target_metric_label
      ? { targetMetricLabel: row.target_metric_label }
      : {}),
    ...(row.target_metric_value
      ? { targetMetricValue: row.target_metric_value }
      : {}),
    ...(row.target_metric_unit
      ? { targetMetricUnit: row.target_metric_unit }
      : {}),
    priorityTier: row.priority_tier as GoalCandidateView["priorityTier"],
    ...(row.target_rank ? { targetRank: row.target_rank } : {}),
    ...(row.rationale ? { rationale: row.rationale } : {}),
    ...(row.constraints_text ? { constraints: row.constraints_text } : {}),
    decision: row.decision as GoalCandidateView["decision"],
    resolution: row.resolution as OnboardingResolution | null,
    targetGoalId: row.target_goal_id,
    comparison,
  };
}

function toMemoryCandidate(
  row: MemoryCandidateRow,
  items: MemoryItemRow[],
  revisions: Map<string, MemoryRevisionRow>,
): MemoryCandidateView {
  const orderedItems = [...items].sort(
    (left, right) =>
      memoryStatusOrder(left.status) - memoryStatusOrder(right.status) ||
      left.id.localeCompare(right.id),
  );
  const exact = orderedItems.find((item) => {
    const revision = revisions.get(item.current_revision_id);
    return (
      item.status === "active" &&
      item.memory_type === row.memory_type &&
      revision?.content === row.content
    );
  });
  const inactiveExact = orderedItems.find((item) => {
    const revision = revisions.get(item.current_revision_id);
    return (
      item.status !== "active" &&
      item.memory_type === row.memory_type &&
      revision?.content === row.content
    );
  });
  const durableField =
    row.field_key.startsWith("context:") ||
    row.field_key.startsWith("constraint:")
      ? row.field_key
      : null;
  const conflict =
    exact ??
    inactiveExact ??
    (durableField
      ? orderedItems.find((item) => item.intake_field_key === durableField)
      : undefined);
  const conflictRevision = conflict
    ? revisions.get(conflict.current_revision_id)
    : undefined;
  const comparison: CandidateComparison = exact
    ? {
        kind: "exact",
        targetId: exact.id,
        existingLabel: memoryTypeLabel(exact.memory_type),
        existingDetail: conflictRevision?.content ?? null,
        existingStatus: "active",
      }
    : conflict
      ? {
          kind: "conflict",
          targetId: conflict.id,
          existingLabel: memoryTypeLabel(conflict.memory_type),
          existingDetail: conflictRevision?.content ?? null,
          existingStatus:
            conflict.status as CandidateComparison["existingStatus"],
        }
      : {
          kind: "new",
          targetId: null,
          existingLabel: null,
          existingDetail: null,
          existingStatus: null,
        };

  return {
    id: row.id,
    position: row.position,
    fieldKey: row.field_key,
    memoryType: row.memory_type,
    content: row.content,
    decision: row.decision as MemoryCandidateView["decision"],
    resolution: row.resolution as OnboardingResolution | null,
    targetMemoryId: row.target_memory_id,
    comparison,
  };
}

function goalMatches(candidate: GoalCandidateRow, goal: GoalRow) {
  return (
    candidate.title === goal.title &&
    candidate.desired_outcome === goal.desired_outcome &&
    candidate.category === goal.category &&
    sameArray(candidate.activity_areas, goal.activity_areas) &&
    candidate.start_date === goal.start_date &&
    candidate.target_date === goal.target_date &&
    candidate.target_detail === goal.target_detail &&
    candidate.target_metric_label === goal.target_metric_label &&
    candidate.target_metric_value === goal.target_metric_value &&
    candidate.target_metric_unit === goal.target_metric_unit &&
    candidate.priority_tier === goal.priority_tier &&
    candidate.rationale === goal.rationale &&
    candidate.constraints_text === goal.constraints_text
  );
}

function sameArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function memoryTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function memoryStatusOrder(value: string) {
  return (
    {
      active: 1,
      proposed: 2,
      archived: 3,
      rejected: 4,
    }[value] ?? 5
  );
}
