import "server-only";

import {
  RollingPlanConflictError,
  RollingPlanValidationError,
  type ParsedPlanSlice,
  type RollingPlanActivity,
  type RollingPlanAdapter,
  type RollingPlanChangeSet,
  type RollingPlanChangeReceipt,
  type RollingPlanSession,
  type RollingPlanSlice,
} from "./rolling-plan";

export class InMemoryRollingPlanAdapter implements RollingPlanAdapter {
  private planId: string | null = null;
  private revision = 0;
  private sessions = new Map<string, RollingPlanSession>();
  private receipts = new Map<
    string,
    { fingerprint: string; receipt: RollingPlanChangeReceipt }
  >();
  private sequence = 0;

  async getPlanSlice({
    startDate,
    endDate,
  }: ParsedPlanSlice): Promise<RollingPlanSlice> {
    return {
      planId: this.planId,
      revision: this.revision,
      sessions: [...this.sessions.values()]
        .filter(
          (session) =>
            session.localDate >= startDate && session.localDate <= endDate,
        )
        .sort(
          (left, right) =>
            left.localDate.localeCompare(right.localDate) ||
            left.position - right.position ||
            left.id.localeCompare(right.id),
        )
        .map(cloneSession),
    };
  }

  async applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ) {
    const fingerprint = JSON.stringify({ expectedPlanRevision, ...changeSet });
    const replay = this.receipts.get(changeSet.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint)
        throw new RollingPlanConflictError();
      return { ...replay.receipt, result: "replayed" as const };
    }
    if (expectedPlanRevision !== this.revision)
      throw new RollingPlanConflictError();

    const next = new Map(
      [...this.sessions].map(([id, session]) => [id, cloneSession(session)]),
    );
    let sequence = this.sequence;
    const nextId = (kind: string) => {
      sequence += 1;
      const suffix = sequence.toString(16).padStart(12, "0");
      const kindNibble =
        ({ plan: "1", change: "2", activity: "3" } as Record<string, string>)[
          kind
        ] ?? "4";
      return `00000000-0000-4000-800${kindNibble}-${suffix}`;
    };
    for (const change of changeSet.changes) {
      const current = next.get(change.sessionId);
      if (change.operation === "add") {
        if (current) throw new RollingPlanValidationError();
        next.set(change.sessionId, {
          id: change.sessionId,
          ...change.session,
          status: "active",
          cancelledAt: null,
          activities: change.session.activities.map((activity) => ({
            ...activity,
            id: nextId("activity"),
          })),
        });
        continue;
      }
      if (!current || current.status !== "active")
        throw new RollingPlanValidationError();
      const before = JSON.stringify(current);
      if (change.operation === "edit") {
        Object.assign(current, change.session, {
          activities: change.session.activities.map((activity) => ({
            ...activity,
            id: nextId("activity"),
          })),
        });
      } else if (change.operation === "move") {
        current.localDate = change.localDate;
        current.position = change.position;
      } else if (change.operation === "set_lock") {
        current.isLocked = change.isLocked;
      } else {
        current.status = "cancelled";
        current.cancelledAt = "2000-01-01T00:00:00.000Z";
      }
      if (JSON.stringify(current) === before)
        throw new RollingPlanValidationError();
    }
    const activeOrders = new Set<string>();
    for (const session of next.values()) {
      if (session.status !== "active") continue;
      const key = `${session.localDate}:${session.position}`;
      if (activeOrders.has(key)) throw new RollingPlanValidationError();
      activeOrders.add(key);
    }

    this.planId ??= nextId("plan");
    this.revision += 1;
    this.sessions = next;
    const receipt: RollingPlanChangeReceipt = {
      planId: this.planId,
      planRevision: this.revision,
      changeSetId: nextId("change"),
      result: "applied",
    };
    this.receipts.set(changeSet.idempotencyKey, { fingerprint, receipt });
    this.sequence = sequence;
    return receipt;
  }
}

function cloneSession(session: RollingPlanSession): RollingPlanSession {
  return {
    ...session,
    activities: session.activities.map((activity: RollingPlanActivity) => ({
      ...activity,
    })),
  };
}
