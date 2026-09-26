import { randomUUID } from "node:crypto";

import {
  CompletionConflictError,
  CompletionDuplicateError,
  CompletionFutureDateError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
  type Completion,
  type CompletionActivity,
  type CompletionChange,
  type CompletionDraft,
  type CompletionLogAdapter,
  type CompletionPlannedSnapshot,
  type CompletionReceipt,
  type ReplacementDraft,
  type ParsedCompletionWindow,
} from "./completion-log";

export type InMemoryCompletionLogOptions = {
  timezoneName?: string | null;
  clock?: () => Date;
};

/**
 * The completion log with the plan and the database taken out. It holds the
 * planned sessions a completion can be measured against as well, because the
 * one behavior the two adapters must agree on most precisely is that the
 * planned snapshot is copied at write time and never read through afterwards.
 */
export class InMemoryCompletionLogAdapter implements CompletionLogAdapter {
  private readonly completions = new Map<
    string,
    Omit<Completion, "replacedBy" | "replaces">
  >();
  /**
   * Replaced log id to the unplanned log it points at. Kept apart and read
   * through on every read, as the database's join is, so a renamed ride reads
   * the same through both adapters.
   */
  private readonly links = new Map<string, string>();
  private readonly planSessions = new Map<string, CompletionPlannedSnapshot>();
  private readonly clock: () => Date;
  private timezoneName: string | null;

  constructor(options: InMemoryCompletionLogOptions = {}) {
    this.timezoneName = options.timezoneName ?? null;
    this.clock = options.clock ?? (() => new Date());
  }

  /** Stands in for a session the Plan already holds. Returns its id. */
  addPlanSession(snapshot: CompletionPlannedSnapshot): string {
    const id = randomUUID();
    this.planSessions.set(id, copy(snapshot));
    return id;
  }

  /** Rewrites a planned session in place, as replanning does. */
  editPlanSession(sessionId: string, title: string): void {
    const session = this.planSessions.get(sessionId);
    if (!session) throw new CompletionValidationError();
    this.planSessions.set(sessionId, { ...session, title, activities: [] });
  }

  clearTimezone(): void {
    this.timezoneName = null;
  }

  async list({
    startDate,
    endDate,
  }: ParsedCompletionWindow): Promise<Completion[]> {
    return [...this.completions.values()]
      .filter(
        (completion) =>
          completion.actualLocalDate >= startDate &&
          completion.actualLocalDate <= endDate,
      )
      .toSorted(
        (left, right) =>
          right.actualLocalDate.localeCompare(left.actualLocalDate) ||
          left.id.localeCompare(right.id),
      )
      .map((completion) => this.view(completion));
  }

  async get(completionId: string): Promise<Completion | null> {
    const completion = this.completions.get(completionId);
    return completion ? this.view(completion) : null;
  }

  async findByPlanSessions(planSessionIds: string[]): Promise<Completion[]> {
    const wanted = new Set(planSessionIds);
    return [...this.completions.values()]
      .filter(
        (candidate) =>
          candidate.planSessionId !== null &&
          wanted.has(candidate.planSessionId),
      )
      .map((completion) => this.view(completion));
  }

  async findByPlanSession(planSessionId: string): Promise<Completion | null> {
    const completion = [...this.completions.values()].find(
      (candidate) => candidate.planSessionId === planSessionId,
    );
    return completion ? this.view(completion) : null;
  }

  /**
   * One call, one outcome, as the write function's transaction: an inline
   * replacement written before a refusal of the planned half is taken back.
   */
  async applyChange(change: CompletionChange): Promise<CompletionReceipt> {
    const completions = new Map(this.completions);
    const links = new Map(this.links);
    try {
      return this.write(change);
    } catch (error) {
      restore(this.completions, completions);
      restore(this.links, links);
      throw error;
    }
  }

  private write(change: CompletionChange): CompletionReceipt {
    if (change.operation === "create") return this.create(change.completion);
    const existing = this.completions.get(change.completionId);
    // A record that is not this owner's, or one already removed, is reported
    // the same way: it changed. That is honest and leaks nothing.
    if (!existing || existing.revision !== change.expectedRevision) {
      throw new CompletionConflictError();
    }
    // The planned link is immutable, so an edit can never cross the boundary
    // between a planned completion and an unplanned one.
    if (
      (change.completion.status === "unplanned") !==
      (existing.planSessionId === null)
    ) {
      throw new CompletionValidationError();
    }
    const {
      activities,
      title,
      sport,
      replacedByCompletionId,
      replacement,
      ...facts
    } = change.completion;
    const replacedBy = this.resolveReplacement(
      facts.actualLocalDate,
      replacedByCompletionId,
      replacement,
    );
    // A planned log's actuals are corrected like any other's; its snapshot is
    // read to check what they answer and is never written.
    if (activities !== undefined) {
      requireAnswersSnapshot(activities, existing.plannedSnapshot);
    }
    // Judged in the zone the completion carries, not the current one.
    this.requireNotFuture(facts.actualLocalDate, existing.timezoneName);
    const updated: Omit<Completion, "replacedBy" | "replaces"> = {
      ...facts,
      // A name the edit does not state is left as it is.
      title: title ?? existing.title,
      sport: sport ?? existing.sport,
      id: existing.id,
      planSessionId: existing.planSessionId,
      timezoneName: existing.timezoneName,
      plannedSnapshot: existing.plannedSnapshot,
      revision: existing.revision + 1,
      activities: copy(activities ?? existing.activities),
      updatedAt: this.clock().toISOString(),
    };
    this.completions.set(updated.id, updated);
    // Set on every edit, so a log corrected away from `replaced` points
    // nowhere; the parser admits a pointer only beside it.
    this.setLink(updated.id, replacedBy);
    return {
      completionId: updated.id,
      revision: updated.revision,
      result: "updated",
    };
  }

  private create(draft: CompletionDraft): CompletionReceipt {
    if (this.timezoneName === null) throw new CompletionTimezoneRequiredError();
    const {
      planSessionId,
      activities,
      title,
      sport,
      replacedByCompletionId,
      replacement,
      ...facts
    } = draft;
    this.requireNotFuture(facts.actualLocalDate, this.timezoneName);
    const replacedBy = this.resolveReplacement(
      facts.actualLocalDate,
      replacedByCompletionId,
      replacement,
    );
    let plannedSnapshot: CompletionPlannedSnapshot | null = null;
    if (planSessionId !== undefined) {
      const session = this.planSessions.get(planSessionId);
      if (!session) throw new CompletionValidationError();
      if (
        [...this.completions.values()].some(
          (completion) => completion.planSessionId === planSessionId,
        )
      ) {
        throw new CompletionDuplicateError();
      }
      // Copied here and never consulted again, which is the whole point.
      plannedSnapshot = copy(session);
    }
    requireAnswersSnapshot(activities, plannedSnapshot);
    // As the write function: a stated name, else the planned session's, else
    // the first activity's, which is where unplanned training kept it before.
    const first = activities.toSorted((l, r) => l.position - r.position)[0];
    const name =
      title !== undefined && sport !== undefined
        ? { title, sport }
        : plannedSnapshot !== null
          ? { title: plannedSnapshot.title, sport: plannedSnapshot.sport }
          : first !== undefined
            ? { title: first.name, sport: first.sport }
            : { title: null, sport: null };
    const completion: Omit<Completion, "replacedBy" | "replaces"> = {
      ...facts,
      ...name,
      id: randomUUID(),
      planSessionId: planSessionId ?? null,
      timezoneName: this.timezoneName,
      plannedSnapshot,
      revision: 0,
      activities: copy(activities),
      updatedAt: this.clock().toISOString(),
    };
    this.completions.set(completion.id, completion);
    this.setLink(completion.id, replacedBy);
    return { completionId: completion.id, revision: 0, result: "created" };
  }

  /**
   * What a replaced log points at, written first when it is new, as the
   * write function does: unplanned training on the same day, through the same
   * create, so every rule it answers to applies unchanged.
   */
  private resolveReplacement(
    actualLocalDate: string,
    link: string | undefined,
    replacement: ReplacementDraft | undefined,
  ): string | null {
    if (replacement !== undefined) {
      return this.create({
        ...replacement,
        status: "unplanned",
        actualLocalDate,
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
      }).completionId;
    }
    if (link === undefined) return null;
    // This owner's unplanned training, and nothing else.
    if (this.completions.get(link)?.planSessionId !== null) {
      throw new CompletionValidationError();
    }
    return link;
  }

  private setLink(completionId: string, target: string | null) {
    if (target === null) this.links.delete(completionId);
    else this.links.set(completionId, target);
  }

  private view(
    completion: Omit<Completion, "replacedBy" | "replaces">,
  ): Completion {
    const target = this.links.get(completion.id);
    const linked =
      target === undefined ? undefined : this.completions.get(target);
    const replaces = [...this.links]
      .filter(([, target]) => target === completion.id)
      .map(([id]) => this.completions.get(id))
      .filter((row) => row !== undefined)
      .toSorted(
        (left, right) =>
          left.actualLocalDate.localeCompare(right.actualLocalDate) ||
          left.id.localeCompare(right.id),
      )
      .map((row) => ({
        completionId: row.id,
        title: row.title ?? row.plannedSnapshot?.title ?? null,
      }));
    return {
      ...copy(completion),
      replaces,
      replacedBy:
        linked === undefined
          ? null
          : {
              completionId: linked.id,
              localDate: linked.actualLocalDate,
              title: linked.title,
              sport: linked.sport,
            },
    };
  }

  /** Nothing is completed before it happens, in the zone that anchors it. */
  private requireNotFuture(actualLocalDate: string, timezoneName: string) {
    if (actualLocalDate > localDateIn(timezoneName, this.clock())) {
      throw new CompletionFutureDateError();
    }
  }
}

function localDateIn(timezoneName: string, instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezoneName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Every `plannedPosition` names an activity of the log's own snapshot, as the
 * write function checks. Unplanned training has no snapshot, so it answers
 * nothing.
 */
function requireAnswersSnapshot(
  activities: CompletionActivity[],
  snapshot: CompletionPlannedSnapshot | null,
): void {
  const planned = new Set(
    (snapshot?.activities ?? []).map((activity) => activity.position),
  );
  for (const activity of activities) {
    if (
      activity.plannedPosition !== undefined &&
      !planned.has(activity.plannedPosition)
    ) {
      throw new CompletionValidationError();
    }
  }
}

function restore<K, V>(target: Map<K, V>, saved: Map<K, V>) {
  target.clear();
  for (const [key, value] of saved) target.set(key, value);
}
