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
  LiveWorkoutState,
  LiveWorkoutView,
} from "@/lib/training/live-workout";
import {
  CompletionDuplicateError,
  CompletionFutureDateError,
  CompletionPersistenceError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
  parseCompletionChange,
  type CompletionReceipt,
} from "@/server/completions/completion-log";
import {
  LiveWorkoutConflictError,
  LiveWorkoutPersistenceError,
  LiveWorkoutRunningError,
  parseLiveWorkoutName,
  parseLiveWorkoutState,
} from "@/server/live-workout/live-workout";

type LiveWorkoutClient = SupabaseClient<Database> | ServerUserClient;

const COLUMNS =
  "id, revision, plan_session_id, title, sport, started_at, paused_at, paused_seconds, state" as const;

type Row = {
  id: string;
  revision: number;
  plan_session_id: string | null;
  title: string;
  sport: string;
  started_at: string;
  paused_at: string | null;
  paused_seconds: number;
  state: Json;
};

export class LiveWorkoutAuthenticationError extends Error {
  constructor(readonly accessError?: VerifiedUserAccessError) {
    super("An authenticated FitTip user is required.");
    this.name = "LiveWorkoutAuthenticationError";
  }
}

/**
 * A workout in progress (ADR-037): one per owner, written directly under RLS
 * as `weight_entries` is. Every write answers to the revision the screen read,
 * so two tabs cannot overwrite each other unseen. It never accepts an owner
 * id; the owner predicate is repeated on every statement, RLS being the
 * backstop.
 */
export class LiveWorkoutRepository {
  constructor(private readonly client: LiveWorkoutClient) {}

  /** The owner's running workout, or null. */
  async current(): Promise<LiveWorkoutView | null> {
    const userId = await this.userId();
    const { data, error } = await this.client
      .from("live_workouts")
      .select(COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new LiveWorkoutPersistenceError();
    return data === null ? null : toView(data);
  }

  async start(input: {
    planSessionId: string | null;
    title: string;
    sport: string;
    state: LiveWorkoutState;
  }): Promise<LiveWorkoutView> {
    await this.userId();
    const name = parseLiveWorkoutName(input.title, input.sport);
    const state = parseLiveWorkoutState(input.state);
    const { data, error } = await this.client
      .from("live_workouts")
      .insert({
        plan_session_id: input.planSessionId,
        title: name.title,
        sport: name.sport,
        state: state as unknown as Json,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new LiveWorkoutRunningError();
      throw new LiveWorkoutPersistenceError();
    }
    if (data === null) throw new LiveWorkoutPersistenceError();
    return toView(data);
  }

  /** The activity list, as the screen now holds it. */
  async saveState(
    id: string,
    expectedRevision: number,
    state: unknown,
  ): Promise<LiveWorkoutView> {
    return await this.update(id, expectedRevision, {
      state: parseLiveWorkoutState(state) as unknown as Json,
    });
  }

  /**
   * Pause or continue. Both are stamped with the server's clock, never the
   * phone's: a pause is the time between two of the server's own readings.
   */
  async setPaused(
    id: string,
    expectedRevision: number,
    paused: boolean,
  ): Promise<LiveWorkoutView> {
    const workout = await this.current();
    if (workout === null || workout.id !== id) {
      throw new LiveWorkoutConflictError();
    }
    const now = new Date();
    if (paused) {
      if (workout.pausedAt !== null) return workout;
      return await this.update(id, expectedRevision, {
        paused_at: now.toISOString(),
      });
    }
    if (workout.pausedAt === null) return workout;
    const pausedFor = Math.max(
      0,
      Math.round((now.valueOf() - new Date(workout.pausedAt).valueOf()) / 1000),
    );
    return await this.update(id, expectedRevision, {
      paused_at: null,
      paused_seconds: Math.min(864000, workout.pausedSeconds + pausedFor),
    });
  }

  /** Discard: nothing is logged and the workout is gone. */
  async discard(id: string): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.client
      .from("live_workouts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new LiveWorkoutPersistenceError();
  }

  /**
   * Writes the log and removes the workout in one transaction
   * (`apply_live_workout_log`). The draft is checked by the completion
   * contract first, exactly as an ordinary create is. The client's transport
   * retry stays on (ADR-037): the function deletes the workout before it
   * writes, so a retried call finds nothing and is refused rather than
   * writing a second log.
   */
  async log(id: string, completion: unknown): Promise<CompletionReceipt> {
    await this.userId();
    const change = parseCompletionChange({ operation: "create", completion });
    if (change.operation !== "create") throw new CompletionValidationError();
    const { data, error } = await this.client.rpc("apply_live_workout_log", {
      p_live_workout_id: id,
      p_completion: change.completion as unknown as Json,
    });
    if (error) {
      if (error.code === "PT409") throw new LiveWorkoutConflictError();
      if (error.code === "PT428") throw new CompletionTimezoneRequiredError();
      if (error.code === "PT430") throw new CompletionFutureDateError();
      if (error.code === "PT431") throw new CompletionDuplicateError();
      if (error.code === "22023") throw new CompletionValidationError();
      throw new CompletionPersistenceError();
    }
    if (!data || data.completion_id === null || data.revision === null) {
      throw new CompletionPersistenceError();
    }
    return {
      completionId: data.completion_id,
      revision: data.revision,
      result: "created",
    };
  }

  private async update(
    id: string,
    expectedRevision: number,
    change: Database["public"]["Tables"]["live_workouts"]["Update"],
  ): Promise<LiveWorkoutView> {
    const userId = await this.userId();
    const { data, error } = await this.client
      .from("live_workouts")
      .update({ ...change, revision: expectedRevision + 1 })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("revision", expectedRevision)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new LiveWorkoutPersistenceError();
    if (data === null) throw new LiveWorkoutConflictError();
    return toView(data);
  }

  private async userId() {
    try {
      return await requireAllowedVerifiedUser(this.client);
    } catch (error) {
      if (error instanceof VerifiedUserAccessError) {
        throw new LiveWorkoutAuthenticationError(error);
      }
      throw new LiveWorkoutAuthenticationError();
    }
  }
}

function toView(row: Row): LiveWorkoutView {
  let state: LiveWorkoutState;
  try {
    state = parseLiveWorkoutState(row.state);
  } catch {
    // Stored by an earlier shape of this screen: shown empty rather than
    // breaking every page that carries the clock.
    state = { activities: [] };
  }
  return {
    id: row.id,
    revision: row.revision,
    planSessionId: row.plan_session_id,
    title: row.title,
    sport: row.sport,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    pausedSeconds: row.paused_seconds,
    state,
  };
}

export async function createLiveWorkouts(): Promise<LiveWorkoutRepository> {
  return new LiveWorkoutRepository(await createServerUserClient());
}
