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
  private readonly completions = new Map<string, Completion>();
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
      .map(copy);
  }

  async get(completionId: string): Promise<Completion | null> {
    const completion = this.completions.get(completionId);
    return completion ? copy(completion) : null;
  }

  async findByPlanSession(planSessionId: string): Promise<Completion | null> {
    const completion = [...this.completions.values()].find(
      (candidate) => candidate.planSessionId === planSessionId,
    );
    return completion ? copy(completion) : null;
  }

  async applyChange(change: CompletionChange): Promise<CompletionReceipt> {
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
    const { activities, title, sport, ...facts } = change.completion;
    // A planned log's actuals are corrected like any other's; its snapshot is
    // read to check what they answer and is never written.
    if (activities !== undefined) {
      requireAnswersSnapshot(activities, existing.plannedSnapshot);
    }
    // Judged in the zone the completion carries, not the current one.
    this.requireNotFuture(facts.actualLocalDate, existing.timezoneName);
    const updated: Completion = {
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
    return {
      completionId: updated.id,
      revision: updated.revision,
      result: "updated",
    };
  }

  private create(draft: CompletionDraft): CompletionReceipt {
    if (this.timezoneName === null) throw new CompletionTimezoneRequiredError();
    const { planSessionId, activities, title, sport, ...facts } = draft;
    this.requireNotFuture(facts.actualLocalDate, this.timezoneName);
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
    const completion: Completion = {
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
    return { completionId: completion.id, revision: 0, result: "created" };
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
