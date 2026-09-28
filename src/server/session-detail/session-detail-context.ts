import "server-only";

import { shiftIsoDate } from "@/lib/date/local-date";
import { activityNameKey } from "@/lib/training/activity-name";
import type {
  TrainingMeasurement,
  TrainingMeasurementMode,
} from "@/lib/training/measurement";
import type {
  CoachAIActivityReference,
  CoachAISessionDetailContext,
} from "@/server/ai/contracts";
import type { Completion } from "@/server/completions/completion-log";
import type { PersonalActivity } from "@/server/personal-activities/personal-activities";
import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";
import type { SavedSession } from "@/server/saved-sessions/saved-sessions";

/**
 * ADR-020: what `fill_session_activities` may read about the session it fills.
 *
 * Two halves, both pure. `selectSessionDetailRecords` decides *which* records
 * are relevant, from records the context source has already read through the
 * owner-scoped repositories, and copies each field one at a time — nothing is
 * spread, so a column added to a plan session, a library entry or a log later
 * is invisible to a provider until this file changes. `buildSessionDetailContext`
 * then fits what was selected into its byte allocation, trimming each list from
 * the end and counting what it withheld, for ADR-013's reason: a coach that
 * silently receives a subset reasons as though it saw everything.
 *
 * It lives outside `src/server/ai` for the reason the other data-shaping
 * modules do: `server-boundary.test.ts` keeps repositories out of that module,
 * and this file's inputs are repository records.
 */

/** Sessions within this many days either side count as the session's week. */
export const SESSION_DETAIL_WEEK_RADIUS_DAYS = 3;
/** Recent actuals are read from this window, which ADR-013 already bounds. */
export const SESSION_DETAIL_MAX_ACTUAL_ENTRIES = 3;
export const SESSION_DETAIL_MAX_ACTUAL_ACTIVITIES = 12;
export const SESSION_DETAIL_MAX_SAVED_SESSIONS = 3;
export const SESSION_DETAIL_MAX_LIBRARY = 60;
export const SESSION_DETAIL_MAX_SESSION_ACTIVITIES = 20;
export const SESSION_DETAIL_MAX_WEEK = 14;
/**
 * The session's own free text, truncated as ADR-013 decision 4 truncates a
 * log's note. The columns allow 500 and 2,000 characters, and at four bytes a
 * character that alone would outgrow the whole allocation; this is what keeps
 * the part's worst case a trim rather than a refusal the owner cannot act on.
 */
export const SESSION_DETAIL_NOTE_MAX_LENGTH = 300;
export const SESSION_DETAIL_INTENT_MAX_LENGTH = 200;

/**
 * The byte allocation of each part, summing under the operation's
 * `sessionDetail` ceiling in `context.ts` with room for the envelope and the
 * five withheld counts. Measured against the worst cases in
 * `session-detail-context.test.ts` rather than trusted:
 *
 * - a session activity with a twenty-group ramp serializes to about 900 bytes
 *   and a plain one to about 150, so 3,500 holds the ordinary session whole and
 *   trims a pathological one with disclosure;
 * - a library entry is about 110 bytes, so 3,500 holds about thirty;
 * - a saved session is a session's worth, and three of them get 4,000;
 * - an actual is about 110 bytes per entry, three entries per activity.
 */
export const SESSION_DETAIL_BYTES = {
  session: 3_500,
  week: 800,
  library: 3_500,
  savedSessions: 4_000,
  recentActuals: 4_000,
} as const;

export type SessionDetailActivityRecord = CoachAIActivityReference;

/** What the source hands assembly: selected and field-copied, not yet sized. */
export type SessionDetailRecords = {
  session: {
    id: string;
    localDate: string;
    status: "active" | "cancelled";
    title: string;
    sport: string;
    intent: string | null;
    durationMinutes: number | null;
    note: string | null;
    activities: SessionDetailActivityRecord[];
  };
  week: {
    localDate: string;
    title: string;
    sport: string;
    durationMinutes: number | null;
  }[];
  library: {
    id: string;
    name: string;
    sport: string;
    measurementMode: TrainingMeasurementMode;
  }[];
  savedSessions: {
    title: string;
    sport: string;
    intent: string | null;
    durationMinutes: number | null;
    activities: SessionDetailActivityRecord[];
  }[];
  recentActuals: {
    name: string;
    personalActivityId: string | null;
    entries: {
      localDate: string;
      measurementMode: TrainingMeasurementMode;
      actual: TrainingMeasurement | null;
    }[];
  }[];
};

/**
 * Chooses what is relevant to one session. Returns `null` when the session is
 * not among `planSessions`, which the caller reads as "not this owner's, or
 * not in the window" — both of which refuse.
 *
 * - The week: the other *active* sessions within three days either side.
 * - Saved sessions: those whose title matches the session's, then those whose
 *   sport does, at most three.
 * - Recent actuals: for the activities that matter here — the session's own,
 *   the chosen saved sessions', then same-sport library entries, at most
 *   twelve — the last three times each was logged with a recorded actual,
 *   newest first. An activity is matched by its library link when both sides
 *   have one, and by its name otherwise.
 */
export function selectSessionDetailRecords(input: {
  sessionId: string;
  planSessions: readonly RollingPlanSession[];
  library: readonly PersonalActivity[];
  savedSessions: readonly SavedSession[];
  /** Newest first, as `CompletionLog.list` returns them. */
  completions: readonly Completion[];
}): SessionDetailRecords | null {
  const session = input.planSessions.find(
    (candidate) => candidate.id === input.sessionId,
  );
  if (!session) return null;

  const weekStart = shiftIsoDate(
    session.localDate,
    -SESSION_DETAIL_WEEK_RADIUS_DAYS,
  );
  const weekEnd = shiftIsoDate(
    session.localDate,
    SESSION_DETAIL_WEEK_RADIUS_DAYS,
  );
  const week = input.planSessions
    .filter(
      (other) =>
        other.id !== session.id &&
        other.status === "active" &&
        other.localDate >= weekStart &&
        other.localDate <= weekEnd,
    )
    .sort((a, b) =>
      a.localDate === b.localDate
        ? a.position - b.position
        : a.localDate < b.localDate
          ? -1
          : 1,
    )
    .slice(0, SESSION_DETAIL_MAX_WEEK)
    .map((other) => ({
      localDate: other.localDate,
      title: other.title,
      sport: other.sport,
      durationMinutes: other.expectedDurationMinutes ?? null,
    }));

  const sportKey = activityNameKey(session.sport);
  const titleKey = activityNameKey(session.title);
  const savedSessions = [
    ...input.savedSessions.filter(
      (saved) => activityNameKey(saved.title) === titleKey,
    ),
    ...input.savedSessions.filter(
      (saved) =>
        activityNameKey(saved.title) !== titleKey &&
        activityNameKey(saved.sport) === sportKey,
    ),
  ].slice(0, SESSION_DETAIL_MAX_SAVED_SESSIONS);

  const sessionActivities = session.activities.map(toActivityRecord);
  const savedRecords = savedSessions.map((saved) => ({
    title: saved.title,
    sport: saved.sport,
    intent: saved.intent ?? null,
    durationMinutes: saved.expectedDurationMinutes ?? null,
    activities: saved.activities.map(toActivityRecord),
  }));

  // Ordered so the trim in `buildSessionDetailContext` loses the least useful
  // entries: those the session or its saved sessions already link come first,
  // because a coach told to keep them needs their definitions to link them;
  // then the session's sport; then the rest in the repository's order.
  const referenced = new Set(
    [...sessionActivities, ...savedRecords.flatMap((saved) => saved.activities)]
      .map((activity) => activity.personalActivityId)
      .filter((id): id is string => id !== null),
  );
  const rank = (entry: PersonalActivity) =>
    referenced.has(entry.id)
      ? 0
      : activityNameKey(entry.sport) === sportKey
        ? 1
        : 2;
  const library = input.library
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => ({
      id: entry.id,
      name: entry.name,
      sport: entry.sport,
      measurementMode: entry.measurementMode,
    }));

  // The activities worth showing history for, in priority order and once each.
  const relevant: { name: string; personalActivityId: string | null }[] = [];
  const seen = new Set<string>();
  const consider = (name: string, personalActivityId: string | null) => {
    const key = personalActivityId ?? `name:${activityNameKey(name)}`;
    if (
      seen.has(key) ||
      relevant.length >= SESSION_DETAIL_MAX_ACTUAL_ACTIVITIES
    )
      return;
    seen.add(key);
    relevant.push({ name, personalActivityId });
  };
  for (const activity of sessionActivities) {
    consider(activity.name, activity.personalActivityId);
  }
  for (const saved of savedRecords) {
    for (const activity of saved.activities) {
      consider(activity.name, activity.personalActivityId);
    }
  }
  for (const entry of library) {
    if (activityNameKey(entry.sport) === sportKey) {
      consider(entry.name, entry.id);
    }
  }

  const recentActuals = relevant
    .map((activity) => ({
      name: activity.name,
      personalActivityId: activity.personalActivityId,
      entries: actualsFor(activity, input.completions),
    }))
    .filter((activity) => activity.entries.length > 0);

  return {
    session: {
      id: session.id,
      localDate: session.localDate,
      status: session.status,
      title: session.title,
      sport: session.sport,
      intent: session.intent ?? null,
      durationMinutes: session.expectedDurationMinutes ?? null,
      note: session.note ?? null,
      activities: sessionActivities,
    },
    week,
    library,
    savedSessions: savedRecords,
    recentActuals,
  };
}

/**
 * Fits the selection into its allocation. Every list keeps its order and loses
 * entries from the end, and every loss is counted. Nothing here refuses: the
 * owner cannot act on "you have too many library entries", so an oversized
 * source is reduced and disclosed rather than denied, as ADR-013 decision 7
 * does for training history.
 */
export function buildSessionDetailContext(
  records: SessionDetailRecords,
  bytes: typeof SESSION_DETAIL_BYTES = SESSION_DETAIL_BYTES,
): CoachAISessionDetailContext {
  let intent = truncate(
    records.session.intent,
    SESSION_DETAIL_INTENT_MAX_LENGTH,
  );
  let note = truncate(records.session.note, SESSION_DETAIL_NOTE_MAX_LENGTH);
  const envelopeOf = () => ({
    localDate: records.session.localDate,
    title: records.session.title,
    sport: records.session.sport,
    intent,
    durationMinutes: records.session.durationMinutes,
    note,
    activities: [],
    activitiesWithheld: records.session.activities.length,
  });
  // Truncation bounds characters; escaping can still make a pathological
  // string six bytes a character. Rather than let the part outgrow its share
  // and refuse, the free text goes first — note, then intent — and the title,
  // sport and date, which the owner can see and which bound the request, stay.
  if (jsonBytes(envelopeOf()) > bytes.session) note = null;
  if (jsonBytes(envelopeOf()) > bytes.session) intent = null;
  const envelope = envelopeOf();
  const activities = fit(
    records.session.activities.slice(0, SESSION_DETAIL_MAX_SESSION_ACTIVITIES),
    bytes.session - jsonBytes(envelope),
  );
  const week = fit(records.week.slice(0, SESSION_DETAIL_MAX_WEEK), bytes.week);
  const library = fit(
    records.library.slice(0, SESSION_DETAIL_MAX_LIBRARY),
    bytes.library,
  );
  const savedSessions = fit(
    records.savedSessions.slice(0, SESSION_DETAIL_MAX_SAVED_SESSIONS),
    bytes.savedSessions,
  );
  const recentActuals = fit(
    records.recentActuals.slice(0, SESSION_DETAIL_MAX_ACTUAL_ACTIVITIES),
    bytes.recentActuals,
  );

  return {
    session: {
      localDate: records.session.localDate,
      title: records.session.title,
      sport: records.session.sport,
      intent,
      durationMinutes: records.session.durationMinutes,
      note,
      activities,
      activitiesWithheld: records.session.activities.length - activities.length,
    },
    week,
    weekWithheld: records.week.length - week.length,
    library,
    libraryWithheld: records.library.length - library.length,
    savedSessions,
    savedSessionsWithheld: records.savedSessions.length - savedSessions.length,
    recentActuals,
    recentActualsWithheld: records.recentActuals.length - recentActuals.length,
  };
}

function toActivityRecord(activity: {
  personalActivityId?: string;
  name: string;
  sport: string;
  measurementMode: TrainingMeasurementMode;
  target?: TrainingMeasurement;
}): SessionDetailActivityRecord {
  return {
    personalActivityId: activity.personalActivityId ?? null,
    name: activity.name,
    sport: activity.sport,
    measurementMode: activity.measurementMode,
    target: activity.target ?? null,
  };
}

/**
 * The last recorded actuals for one activity. A log without an actual (a skip,
 * or one written before A4) says nothing about load and is passed over rather
 * than sent as an empty entry.
 */
function actualsFor(
  activity: { name: string; personalActivityId: string | null },
  completions: readonly Completion[],
): SessionDetailRecords["recentActuals"][number]["entries"] {
  const nameKey = activityNameKey(activity.name);
  const entries: SessionDetailRecords["recentActuals"][number]["entries"] = [];
  for (const completion of completions) {
    if (entries.length >= SESSION_DETAIL_MAX_ACTUAL_ENTRIES) break;
    const match = completion.activities.find((done) =>
      activity.personalActivityId !== null && done.personalActivityId
        ? done.personalActivityId === activity.personalActivityId
        : activityNameKey(done.name) === nameKey,
    );
    if (!match || match.actualMeasurement === undefined) continue;
    entries.push({
      localDate: completion.actualLocalDate,
      measurementMode: match.measurementMode,
      actual: match.actualMeasurement,
    });
  }
  return entries;
}

/** By code point, so a truncation never splits a character in two. */
function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join("");
}

/** The longest prefix of `items` whose serialized list fits `budget` bytes. */
function fit<Item>(items: readonly Item[], budget: number): Item[] {
  const kept: Item[] = [];
  let used = 2; // the brackets
  for (const item of items) {
    const cost = jsonBytes(item) + (kept.length > 0 ? 1 : 0);
    if (used + cost > budget) break;
    kept.push(item);
    used += cost;
  }
  return kept;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
