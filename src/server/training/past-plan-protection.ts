import "server-only";

import type {
  ManualPlanInput,
  PlannedSessionInput,
} from "@/server/training/training-records";

export class PastPlanContentMutationError extends Error {
  constructor() {
    super("Past accepted plan content cannot be changed.");
    this.name = "PastPlanContentMutationError";
  }
}

export function assertPastPlanContentIsImmutable(
  current: ManualPlanInput | null,
  proposed: ManualPlanInput,
  now: Date,
): void {
  const timezoneName = current?.timezoneName ?? proposed.timezoneName;
  const today = ownerLocalIsoDate(now, timezoneName);
  const proposedEndDate = addIsoDays(proposed.startDate, proposed.dayCount - 1);
  const proposedPast = canonicalSessions(
    proposed.sessions.filter(({ localDate }) => localDate < today),
  );
  const protectedCurrentPast = canonicalSessions(
    (current?.sessions ?? []).filter(
      ({ localDate }) =>
        localDate < today &&
        localDate >= proposed.startDate &&
        localDate <= proposedEndDate,
    ),
  );

  if (JSON.stringify(proposedPast) !== JSON.stringify(protectedCurrentPast)) {
    throw new PastPlanContentMutationError();
  }
}

export function ownerLocalIsoDate(now: Date, timezoneName: string): string {
  if (Number.isNaN(now.getTime())) {
    throw new PastPlanContentMutationError();
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneName,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  if (!year || !month || !day) {
    throw new PastPlanContentMutationError();
  }
  return `${year}-${month}-${day}`;
}

function canonicalSessions(sessions: PlannedSessionInput[]) {
  return sessions
    .map((session) => ({
      localDate: session.localDate,
      position: session.position,
      title: session.title,
      sport: session.sport,
      intent: session.intent ?? null,
      expectedDurationMinutes: session.expectedDurationMinutes ?? null,
      note: session.note ?? null,
      isLocked: session.isLocked,
      activities: session.activities
        .map((activity) => ({
          personalActivityId: activity.personalActivityId ?? null,
          position: activity.position,
          name: activity.name,
          sport: activity.sport,
          instructions: activity.instructions ?? null,
          measurementMode: activity.measurementMode,
          target: activity.target ?? null,
          isLocked: activity.isLocked,
        }))
        .toSorted((left, right) => left.position - right.position),
    }))
    .toSorted(
      (left, right) =>
        left.localDate.localeCompare(right.localDate) ||
        left.position - right.position,
    );
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
