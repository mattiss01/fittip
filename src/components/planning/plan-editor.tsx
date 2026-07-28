"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import {
  archivePersonalActivityAction,
  createPersonalActivityAction,
  savePlanAction,
  updatePersonalActivityAction,
} from "@/app/home/plan/actions";
import { ActivityLibrary } from "@/components/planning/activity-library";
import { SessionComposer } from "@/components/planning/session-composer";
import type {
  PlanDraft,
  PlanSessionDraft,
  PlanningActionResult,
  PlanningInitialState,
} from "@/features/planning/planning-types";
import { createClientId } from "@/features/planning/planning-utils";

const DAY_COUNT_KEY = "fittip.plan.day-count.v1";
const UNSAVED_PLAN_MESSAGE =
  "Leave this plan? Your unsaved changes will be lost.";

export function PlanEditor({
  initialState,
}: {
  initialState: PlanningInitialState;
}) {
  const router = useRouter();
  const rememberedDayCount = useSyncExternalStore(
    subscribeToDayCount,
    readRememberedDayCount,
    defaultDayCount,
  );
  const browserToday = useSyncExternalStore(
    subscribeToEnvironment,
    localToday,
    serverToday,
  );
  const browserTimezone = useSyncExternalStore(
    subscribeToEnvironment,
    localTimezone,
    serverTimezone,
  );
  const [draftState, setDraftState] = useState<PlanDraft | null>(() =>
    initialState.plan ? structuredClone(initialState.plan) : null,
  );
  const draft =
    draftState ??
    createEmptyPlan(rememberedDayCount, browserToday, browserTimezone);
  const [expectedRevision, setExpectedRevision] = useState(
    initialState.expectedRevision,
  );
  const [versionNumber, setVersionNumber] = useState(
    initialState.versionNumber,
  );
  const [personalActivities, setPersonalActivities] = useState(
    initialState.personalActivities,
  );
  const [editing, setEditing] = useState<PlanSessionDraft | null>(null);
  const editorOpenerRef = useRef<HTMLElement | null>(null);
  const wasEditingRef = useRef(false);
  const isOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    readOnlineStatus,
    serverOnlineStatus,
  );
  const [result, setResult] = useState<PlanningActionResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [baseline, setBaseline] = useState<string | null>(() =>
    initialState.plan ? stablePlan(initialState.plan) : null,
  );
  const dirty =
    draftState !== null &&
    (baseline === null || stablePlan(draftState) !== baseline);
  const dirtyRef = useRef(dirty);
  const dates = useMemo(
    () => createDateRange(draft.startDate, draft.dayCount),
    [draft.dayCount, draft.startDate],
  );

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (editing) {
      wasEditingRef.current = true;
      return;
    }
    if (!wasEditingRef.current) return;
    wasEditingRef.current = false;
    editorOpenerRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const token = `fittip-plan-${crypto.randomUUID()}`;
    const priorState =
      typeof window.history.state === "object" && window.history.state !== null
        ? window.history.state
        : {};
    const baseState = { ...priorState, __fittipPlanBase: token };
    const guardState = { ...baseState, __fittipPlanGuard: token };
    window.history.replaceState(baseState, "", window.location.href);
    window.history.pushState(guardState, "", window.location.href);
    let active = true;

    const handlePopState = () => {
      if (!active) return;
      if (dirtyRef.current && !window.confirm(UNSAVED_PLAN_MESSAGE)) {
        window.history.pushState(guardState, "", window.location.href);
        return;
      }
      active = false;
      window.removeEventListener("popstate", handlePopState);
      window.history.back();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      active = false;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function changeRange(nextStartDate: string, nextDayCount: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextStartDate)) {
      setResult({
        status: "validation-error",
        message: "Choose a valid start date before changing the horizon.",
      });
      return;
    }
    const nextDates = new Set(createDateRange(nextStartDate, nextDayCount));
    const removedCount = draft.sessions.filter(
      ({ localDate }) => !nextDates.has(localDate),
    ).length;
    if (
      removedCount > 0 &&
      !window.confirm(
        `${removedCount} session${removedCount === 1 ? "" : "s"} fall outside this range and will be removed from the new version. Continue?`,
      )
    ) {
      return;
    }

    const nextDraft = {
      ...draft,
      startDate: nextStartDate,
      dayCount: nextDayCount,
      sessions: draft.sessions.filter(({ localDate }) =>
        nextDates.has(localDate),
      ),
    };
    setDraftState(nextDraft);
    setResult(null);
    localStorage.setItem(DAY_COUNT_KEY, String(nextDayCount));
  }

  function saveSession(session: PlanSessionDraft) {
    setDraftState((storedDraft) => {
      const current = storedDraft ?? draft;
      const exists = current.sessions.some(
        ({ clientId }) => clientId === session.clientId,
      );
      return {
        ...current,
        sessions: exists
          ? current.sessions.map((candidate) =>
              candidate.clientId === session.clientId ? session : candidate,
            )
          : [...current.sessions, session],
      };
    });
    closeSessionEditor();
    setResult(null);
  }

  function openSessionEditor(session: PlanSessionDraft, opener?: HTMLElement) {
    editorOpenerRef.current =
      opener ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setEditing(session);
  }

  function closeSessionEditor() {
    setEditing(null);
  }

  function removeSession(clientId: string) {
    if (!window.confirm("Remove this session from the new plan version?")) {
      return;
    }
    setDraftState((storedDraft) => {
      const current = storedDraft ?? draft;
      return {
        ...current,
        sessions: current.sessions.filter(
          (session) => session.clientId !== clientId,
        ),
      };
    });
    setResult(null);
  }

  function duplicateSession(session: PlanSessionDraft, opener: HTMLElement) {
    openSessionEditor(
      {
        ...structuredClone(session),
        clientId: createClientId("session"),
        title: `${session.title} copy`,
      },
      opener,
    );
  }

  function moveSession(clientId: string, localDate: string) {
    setDraftState((storedDraft) => {
      const current = storedDraft ?? draft;
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.clientId === clientId ? { ...session, localDate } : session,
        ),
      };
    });
    setResult(null);
  }

  function moveSessionOrder(clientId: string, direction: -1 | 1) {
    setDraftState((storedDraft) => {
      const current = storedDraft ?? draft;
      const session = current.sessions.find(
        (candidate) => candidate.clientId === clientId,
      );
      if (!session) return current;
      const sameDay = current.sessions.filter(
        ({ localDate }) => localDate === session.localDate,
      );
      const index = sameDay.findIndex(
        (candidate) => candidate.clientId === clientId,
      );
      const swapWith = sameDay[index + direction];
      if (!swapWith) return current;
      const next = [...current.sessions];
      const firstIndex = next.findIndex(
        (candidate) => candidate.clientId === clientId,
      );
      const secondIndex = next.findIndex(
        (candidate) => candidate.clientId === swapWith.clientId,
      );
      [next[firstIndex], next[secondIndex]] = [
        next[secondIndex],
        next[firstIndex],
      ];
      return { ...current, sessions: next };
    });
    setResult(null);
  }

  function toggleSessionLock(clientId: string) {
    setDraftState((storedDraft) => {
      const current = storedDraft ?? draft;
      return {
        ...current,
        sessions: current.sessions.map((session) =>
          session.clientId === clientId
            ? { ...session, isLocked: !session.isLocked }
            : session,
        ),
      };
    });
    setResult(null);
  }

  function handleSave() {
    setResult(null);
    if (!isOnline) {
      setResult({
        status: "save-error",
        message:
          "You appear to be offline. Your draft is still here; reconnect before saving.",
      });
      return;
    }

    startSaving(async () => {
      const saveResult = await savePlanAction(
        toPersistencePlan(draft),
        expectedRevision,
      );
      setResult(saveResult);
      if (saveResult.status === "saved") {
        setExpectedRevision(saveResult.revision);
        setVersionNumber(saveResult.versionNumber);
        setBaseline(stablePlan(draft));
        router.refresh();
      }
    });
  }

  const sessionCount = draft.sessions.length;
  const activityCount = draft.sessions.reduce(
    (total, session) => total + session.activities.length,
    0,
  );

  return (
    <main className="plan-shell">
      <div
        aria-hidden={editing ? true : undefined}
        className="plan-background"
        inert={editing ? true : undefined}
      >
        <header className="plan-header">
          <div>
            <Link
              className="back-link"
              href="/home"
              onClick={(event) => {
                if (dirty && !window.confirm(UNSAVED_PLAN_MESSAGE)) {
                  event.preventDefault();
                }
              }}
            >
              ← Home
            </Link>
            <p className="eyebrow">FitTip / training ledger</p>
            <h1>Plan what’s next.</h1>
            <p className="plan-intro">
              Choose the horizon. Build the sessions. Nothing becomes accepted
              until you save.
            </p>
          </div>
          <div className="version-stamp" aria-label="Current plan version">
            <span>Accepted</span>
            <strong>
              {versionNumber ? `v${versionNumber}` : "No version"}
            </strong>
          </div>
        </header>

        <section className="horizon-panel" aria-labelledby="horizon-title">
          <div className="section-heading">
            <div>
              <p className="step-mark">01 / HORIZON</p>
              <h2 id="horizon-title">How far ahead?</h2>
            </div>
            <p>Maximum 7 days</p>
          </div>
          <fieldset className="day-count-fieldset">
            <legend className="sr-only">Number of days to plan</legend>
            {[1, 2, 3, 4, 5, 6, 7].map((count) => (
              <button
                aria-pressed={draft.dayCount === count}
                className="day-count-button"
                key={count}
                onClick={() => changeRange(draft.startDate, count)}
                type="button"
              >
                {count}
              </button>
            ))}
          </fieldset>
          <label className="date-field">
            Start date
            <input
              min={localToday()}
              onChange={(event) =>
                changeRange(event.currentTarget.value, draft.dayCount)
              }
              type="date"
              value={draft.startDate}
            />
          </label>
          <p className="range-summary">
            {formatShortDate(dates[0])} → {formatShortDate(dates.at(-1) ?? "")}
            <span>{draft.timezoneName}</span>
          </p>
        </section>

        {!isOnline ? (
          <p className="offline-banner" role="status">
            Offline — keep editing if you like; saving waits for your
            connection.
          </p>
        ) : null}

        <section className="plan-days" aria-labelledby="days-title">
          <div className="section-heading">
            <div>
              <p className="step-mark">02 / SESSIONS</p>
              <h2 id="days-title">The next {draft.dayCount}</h2>
            </div>
            <p>
              {sessionCount} session{sessionCount === 1 ? "" : "s"}
            </p>
          </div>

          {dates.map((date, dateIndex) => {
            const sessions = draft.sessions.filter(
              ({ localDate }) => localDate === date,
            );
            const isPast = date < browserToday;
            return (
              <article className="plan-day" key={date}>
                <header className="plan-day-header">
                  <div className="date-index">
                    {String(dateIndex + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <p>{formatWeekday(date)}</p>
                    <h3>{formatLongDate(date)}</h3>
                  </div>
                  <button
                    className="add-session-button"
                    disabled={isPast}
                    onClick={(event) =>
                      openSessionEditor(
                        createEmptySession(date),
                        event.currentTarget,
                      )
                    }
                    type="button"
                  >
                    {isPast ? "Past" : "+ Add"}
                  </button>
                </header>

                {sessions.length === 0 ? (
                  <div className="empty-day">
                    <span aria-hidden="true">—</span>
                    <p>No training planned</p>
                  </div>
                ) : (
                  <ol className="session-list">
                    {sessions.map((session, sessionIndex) => (
                      <li className="session-card" key={session.clientId}>
                        <div className="session-main">
                          <p className="session-meta">
                            {session.sport}
                            {session.expectedDurationMinutes
                              ? ` · ${session.expectedDurationMinutes} min`
                              : ""}
                          </p>
                          <h4>{session.title}</h4>
                          <p>
                            {session.intent ||
                              (session.activities.length
                                ? `${session.activities.length} planned ${session.activities.length === 1 ? "activity" : "activities"}`
                                : "Session details only")}
                          </p>
                          {session.isLocked ? (
                            <span className="lock-badge">
                              Locked for replans
                            </span>
                          ) : null}
                        </div>
                        {isPast ? (
                          <p className="past-session-note">
                            Past plan · read-only
                          </p>
                        ) : (
                          <div
                            className="session-actions"
                            aria-label={`Actions for ${session.title}`}
                          >
                            <button
                              aria-label={`Move ${session.title} up`}
                              disabled={sessionIndex === 0}
                              onClick={() =>
                                moveSessionOrder(session.clientId, -1)
                              }
                              type="button"
                            >
                              ↑
                            </button>
                            <button
                              aria-label={`Move ${session.title} down`}
                              disabled={sessionIndex === sessions.length - 1}
                              onClick={() =>
                                moveSessionOrder(session.clientId, 1)
                              }
                              type="button"
                            >
                              ↓
                            </button>
                            <button
                              onClick={(event) =>
                                openSessionEditor(
                                  structuredClone(session),
                                  event.currentTarget,
                                )
                              }
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(event) =>
                                duplicateSession(session, event.currentTarget)
                              }
                              type="button"
                            >
                              Copy
                            </button>
                            <button
                              onClick={() =>
                                toggleSessionLock(session.clientId)
                              }
                              type="button"
                            >
                              {session.isLocked ? "Unlock" : "Lock"}
                            </button>
                            <label>
                              <span className="sr-only">
                                Move {session.title} to another date
                              </span>
                              <select
                                aria-label={`Move ${session.title} to date`}
                                onChange={(event) =>
                                  moveSession(
                                    session.clientId,
                                    event.currentTarget.value,
                                  )
                                }
                                value={session.localDate}
                              >
                                {dates
                                  .filter(
                                    (candidate) => candidate >= browserToday,
                                  )
                                  .map((candidate) => (
                                    <option key={candidate} value={candidate}>
                                      {formatShortDate(candidate)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <button
                              className="danger-text"
                              onClick={() => removeSession(session.clientId)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </section>

        <ActivityLibrary
          activities={personalActivities}
          onArchive={async (id) => {
            const archiveResult = await archivePersonalActivityAction(id);
            if (archiveResult.status === "archived") {
              setPersonalActivities((current) =>
                current.filter((activity) => activity.id !== id),
              );
            }
            return archiveResult;
          }}
          onCreate={async (input) => {
            const activityResult = await createPersonalActivityAction(input);
            if (activityResult.status === "saved") {
              setPersonalActivities((current) => [
                ...current,
                activityResult.activity,
              ]);
            }
            return activityResult;
          }}
          onUpdate={async (id, input) => {
            const activityResult = await updatePersonalActivityAction(
              id,
              input,
            );
            if (activityResult.status === "saved") {
              setPersonalActivities((current) =>
                current.map((activity) =>
                  activity.id === id ? activityResult.activity : activity,
                ),
              );
            }
            return activityResult;
          }}
        />

        <section className="save-dock" aria-label="Plan save summary">
          <div>
            <p>{dirty ? "Draft changes" : "Up to date"}</p>
            <strong>
              {sessionCount} sessions · {activityCount} activities ·{" "}
              {draft.dayCount} days
            </strong>
          </div>
          <button
            disabled={!dirty || isSaving || !isOnline}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "Saving…" : "Save plan"}
          </button>
        </section>

        {result ? (
          <div
            className={`save-message ${result.status}`}
            role={result.status === "saved" ? "status" : "alert"}
          >
            {result.status === "saved" ? (
              <p>
                Plan version {result.versionNumber} accepted. Earlier versions
                are unchanged.
              </p>
            ) : (
              <>
                <p>{result.message}</p>
                {result.status === "conflict" ? (
                  <button
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    Reload current plan
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {editing ? (
        <SessionComposer
          dates={dates}
          initialSession={editing}
          onCancel={closeSessionEditor}
          onSave={saveSession}
          personalActivities={personalActivities}
        />
      ) : null}
    </main>
  );
}

function createEmptyPlan(
  dayCount: number,
  startDate: string,
  timezoneName: string,
): PlanDraft {
  return {
    dayCount,
    startDate,
    timezoneName,
    sessions: [],
  };
}

function createEmptySession(localDate: string): PlanSessionDraft {
  return {
    clientId: createClientId("session"),
    localDate,
    title: "",
    sport: "",
    intent: "",
    note: "",
    isLocked: false,
    activities: [],
  };
}

export function createDateRange(startDate: string, count: number): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function readRememberedDayCount() {
  const remembered = Number(localStorage.getItem(DAY_COUNT_KEY));
  return Number.isInteger(remembered) && remembered >= 1 && remembered <= 7
    ? remembered
    : 7;
}

function subscribeToDayCount(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === DAY_COUNT_KEY) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function subscribeToEnvironment() {
  return () => {};
}

function subscribeToOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function readOnlineStatus() {
  return navigator.onLine;
}

function defaultDayCount() {
  return 7;
}

function serverToday() {
  return new Date().toISOString().slice(0, 10);
}

function serverTimezone() {
  return "UTC";
}

function serverOnlineStatus() {
  return true;
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatShortDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function stablePlan(plan: PlanDraft) {
  return JSON.stringify(toPersistencePlan(plan));
}

export function toPersistencePlan(plan: PlanDraft) {
  const sessionsByDate = new Map<string, PlanSessionDraft[]>();
  for (const session of plan.sessions) {
    const sameDate = sessionsByDate.get(session.localDate) ?? [];
    sameDate.push(session);
    sessionsByDate.set(session.localDate, sameDate);
  }

  return {
    dayCount: plan.dayCount,
    startDate: plan.startDate,
    timezoneName: plan.timezoneName,
    sessions: plan.sessions.map((session) => ({
      localDate: session.localDate,
      position:
        sessionsByDate
          .get(session.localDate)
          ?.findIndex(({ clientId }) => clientId === session.clientId) ?? 0,
      title: session.title,
      sport: session.sport,
      ...(session.intent ? { intent: session.intent } : {}),
      ...(session.expectedDurationMinutes
        ? { expectedDurationMinutes: session.expectedDurationMinutes }
        : {}),
      ...(session.note ? { note: session.note } : {}),
      isLocked: session.isLocked,
      activities: session.activities.map((activity, index) => ({
        ...(activity.personalActivityId
          ? { personalActivityId: activity.personalActivityId }
          : {}),
        position: index,
        name: activity.name,
        sport: activity.sport,
        ...(activity.instructions
          ? { instructions: activity.instructions }
          : {}),
        measurementMode: activity.measurementMode,
        ...(activity.target ? { target: compactTarget(activity.target) } : {}),
        isLocked: activity.isLocked,
      })),
    })),
  };
}

function compactTarget(
  target: Record<string, string | number | boolean | undefined>,
) {
  return Object.fromEntries(
    Object.entries(target).filter(([, value]) => value !== undefined),
  );
}
