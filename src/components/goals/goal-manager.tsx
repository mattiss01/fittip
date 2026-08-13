"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  INITIAL_GOAL_ACTION_STATE,
  type GoalActionDraft,
  type GoalActionState,
} from "@/app/home/you/goals/action-state";
import { changeGoalAction } from "@/app/home/you/goals/actions";
import styles from "@/app/home/you/goals/goals.module.css";
import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  watchTransition,
  WATCH_INTERVAL_MS,
  type TransitionWatch,
} from "@/lib/app-router/transition-watchdog";

export type GoalView = {
  id: string;
  title: string;
  desiredOutcome: string;
  category: string;
  activityAreas: string[];
  startDate: string;
  targetDate: string | null;
  targetDetail: string | null;
  targetMetricLabel: string | null;
  targetMetricValue: string | null;
  targetMetricUnit: string | null;
  priorityTier: "core" | "supporting";
  status: "active" | "paused" | "achieved" | "abandoned";
  activeRank: number | null;
  rationale: string | null;
  constraints: string | null;
  archivedAt: string | null;
};

type Props = {
  initialGoals: GoalView[];
  expectedRevision: number;
};

const CATEGORIES = [
  ["performance_event", "Performance or event"],
  ["skill", "Skill"],
  ["strength", "Strength"],
  ["endurance", "Endurance"],
  ["mobility", "Mobility"],
  ["body_composition", "Body composition"],
  ["recovery_general_fitness", "Recovery or general fitness"],
  ["other", "Other"],
] as const;

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no goal content, only the fact that the reload was
 * self-triggered.
 */
const RECOVERY_FLAG = "fittip.goals.recovered:v1";

const RECOVERED_NOTICE =
  "Your last goal change did not appear, so these goals were reloaded. The list below is what is saved.";

export function GoalManager({ initialGoals, expectedRevision }: Props) {
  const [state, action, pending] = useActionState(
    changeGoalAction,
    INITIAL_GOAL_ACTION_STATE,
  );
  const stall = useMutationStall(pending, state.submission);
  const recovered = useRecoveredReload(state.submission);
  const notice =
    stallNotice(stall) ??
    (pending ? "Saving goal change…" : null) ??
    (recovered ? RECOVERED_NOTICE : null);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);
  const active = initialGoals.filter(
    (goal) => goal.status === "active" && goal.archivedAt === null,
  );
  const core = active
    .filter((goal) => goal.priorityTier === "core")
    .toSorted(byRank);
  const supporting = active
    .filter((goal) => goal.priorityTier === "supporting")
    .toSorted(byRank);
  const paused = initialGoals.filter(
    (goal) => goal.status === "paused" && goal.archivedAt === null,
  );
  const historical = initialGoals.filter(
    (goal) =>
      goal.archivedAt !== null ||
      goal.status === "achieved" ||
      goal.status === "abandoned",
  );

  return (
    <div className={styles.manager}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice ?? state.message}
      </p>
      {state.conflict === "stale" || stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/you/goals">
          Reload current goals
        </a>
      ) : null}

      <section className={styles.attention} aria-labelledby="core-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>
              Primary attention / {core.length} of 3
            </p>
            <h2 id="core-heading">Core goals</h2>
          </div>
          <span
            className={styles.slotSignal}
            aria-label={`${3 - core.length} core slots open`}
          >
            {Array.from({ length: 3 }, (_, index) => (
              <i key={index} data-filled={index < core.length} />
            ))}
          </span>
        </div>
        {core.length ? (
          <ol className={styles.goalList}>
            {core.map((goal, index) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                expectedRevision={expectedRevision}
                order={core}
                index={index}
                action={action}
                actionState={state}
                pending={pending}
              />
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>
            No core goal yet. Choose up to three outcomes that deserve primary
            training attention.
          </p>
        )}
      </section>

      <section
        className={styles.supporting}
        aria-labelledby="supporting-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Secondary attention</p>
            <h2 id="supporting-heading">Supporting goals</h2>
          </div>
        </div>
        {supporting.length ? (
          <ol className={styles.goalList}>
            {supporting.map((goal, index) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                expectedRevision={expectedRevision}
                order={supporting}
                index={index}
                action={action}
                actionState={state}
                pending={pending}
              />
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>
            Supporting goals stay visible without consuming a core slot.
          </p>
        )}
      </section>

      <details className={styles.addPanel}>
        <summary>Add goal</summary>
        <GoalForm
          key={`create-${state.submission}`}
          action={action}
          expectedRevision={expectedRevision}
          pending={pending}
          draft={state.operation === "create" ? state.draft : undefined}
        />
      </details>

      <HistorySection
        title="Paused"
        goals={paused}
        expectedRevision={expectedRevision}
        action={action}
        pending={pending}
      />
      <HistorySection
        title="History and archive"
        goals={historical}
        expectedRevision={expectedRevision}
        action={action}
        pending={pending}
      />
    </div>
  );
}

function GoalCard({
  goal,
  expectedRevision,
  order,
  index,
  action,
  actionState,
  pending,
}: {
  goal: GoalView;
  expectedRevision: number;
  order: GoalView[];
  index: number;
  action: (payload: FormData) => void;
  actionState: GoalActionState;
  pending: boolean;
}) {
  return (
    <li className={styles.goalCard}>
      <div className={styles.rank} aria-label={`Rank ${goal.activeRank}`}>
        {String(goal.activeRank).padStart(2, "0")}
      </div>
      <div className={styles.goalBody}>
        <div className={styles.goalHeader}>
          <div>
            <p className={styles.category}>{categoryLabel(goal.category)}</p>
            <h3>{goal.title}</h3>
          </div>
          <span className={styles.tier}>{goal.priorityTier}</span>
        </div>
        <p className={styles.outcome}>{goal.desiredOutcome}</p>
        {goal.activityAreas.length ? (
          <p className={styles.areas}>{goal.activityAreas.join(" · ")}</p>
        ) : null}
        <div className={styles.controls}>
          <ReorderButton
            label="Move up"
            goal={goal}
            order={order}
            destination={index - 1}
            action={action}
            expectedRevision={expectedRevision}
            disabled={pending || index === 0}
          />
          <ReorderButton
            label="Move down"
            goal={goal}
            order={order}
            destination={index + 1}
            action={action}
            expectedRevision={expectedRevision}
            disabled={pending || index === order.length - 1}
          />
        </div>
        <details className={styles.detail} data-goal-editor>
          <summary>Review and edit</summary>
          <GoalForm
            key={`edit-${goal.id}-${
              actionState.operation === "edit" && actionState.goalId === goal.id
                ? actionState.submission
                : 0
            }`}
            action={action}
            expectedRevision={expectedRevision}
            goal={goal}
            pending={pending}
            draft={
              actionState.operation === "edit" && actionState.goalId === goal.id
                ? actionState.draft
                : undefined
            }
          />
          <div className={styles.lifecycle}>
            <SimpleAction
              operation="pause"
              label="Pause"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <ConfirmedAction
              operation="achieve"
              label="Mark achieved"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <ConfirmedAction
              operation="abandon"
              label="Mark abandoned"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <ConfirmedAction
              operation="archive"
              label="Archive"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <ConfirmedAction
              operation="delete"
              label="Delete if unused"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          </div>
          <p className={styles.consequence}>
            Archive keeps this record. Permanent delete succeeds only before the
            goal has retained history or another record references it.
          </p>
        </details>
      </div>
    </li>
  );
}

function GoalForm({
  action,
  expectedRevision,
  goal,
  pending,
  draft,
}: {
  action: (payload: FormData) => void;
  expectedRevision: number;
  goal?: GoalView;
  pending: boolean;
  draft?: GoalActionDraft;
}) {
  const initial = (field: keyof GoalActionDraft, fallback = "") =>
    draft?.[field] ?? fallback;

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="operation" value={goal ? "edit" : "create"} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      {goal ? <input type="hidden" name="goalId" value={goal.id} /> : null}
      {goal ? (
        <input
          type="hidden"
          name="originalPriorityTier"
          value={goal.priorityTier}
        />
      ) : null}
      <label>
        Goal title
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={initial("title", goal?.title)}
        />
      </label>
      <label>
        Desired outcome
        <textarea
          name="desiredOutcome"
          required
          maxLength={1000}
          defaultValue={initial("desiredOutcome", goal?.desiredOutcome)}
        />
      </label>
      <div className={styles.fieldPair}>
        <label>
          Category
          <select
            name="category"
            defaultValue={initial("category", goal?.category ?? "other")}
          >
            {CATEGORIES.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Attention
          <select
            name="priorityTier"
            defaultValue={initial(
              "priorityTier",
              goal?.priorityTier ?? "supporting",
            )}
          >
            <option value="core">Core</option>
            <option value="supporting">Supporting</option>
          </select>
        </label>
      </div>
      <label>
        Sports or activity areas
        <input
          name="activityAreas"
          maxLength={600}
          placeholder="Running, football, mobility"
          defaultValue={initial(
            "activityAreas",
            goal?.activityAreas.join(", "),
          )}
        />
      </label>
      <div className={styles.fieldPair}>
        <label>
          Start date
          <input
            name="startDate"
            type="date"
            required
            defaultValue={initial("startDate", goal?.startDate)}
          />
        </label>
        <label>
          Target date (optional)
          <input
            name="targetDate"
            type="date"
            defaultValue={initial("targetDate", goal?.targetDate ?? "")}
          />
        </label>
      </div>
      <label>
        Target or event detail (optional)
        <input
          name="targetDetail"
          maxLength={500}
          defaultValue={initial("targetDetail", goal?.targetDetail ?? "")}
        />
      </label>
      <div className={styles.metric}>
        <label>
          Target measure
          <input
            name="targetMetricLabel"
            maxLength={80}
            placeholder="Finish time"
            defaultValue={initial(
              "targetMetricLabel",
              goal?.targetMetricLabel ?? "",
            )}
          />
        </label>
        <label>
          Target value
          <input
            name="targetMetricValue"
            maxLength={120}
            placeholder="Under 3 hours"
            defaultValue={initial(
              "targetMetricValue",
              goal?.targetMetricValue ?? "",
            )}
          />
        </label>
        <label>
          Unit
          <input
            name="targetMetricUnit"
            maxLength={40}
            placeholder="hours"
            defaultValue={initial(
              "targetMetricUnit",
              goal?.targetMetricUnit ?? "",
            )}
          />
        </label>
      </div>
      <label>
        Why this matters (optional)
        <textarea
          name="rationale"
          maxLength={500}
          defaultValue={initial("rationale", goal?.rationale ?? "")}
        />
      </label>
      <label>
        Goal-specific constraints (optional)
        <textarea
          name="constraints"
          maxLength={1000}
          defaultValue={initial("constraints", goal?.constraints ?? "")}
        />
      </label>
      <input name="targetRank" type="hidden" value={goal?.activeRank ?? ""} />
      <button className={styles.primary} disabled={pending}>
        {goal ? "Save goal" : "Create active goal"}
      </button>
    </form>
  );
}

function ReorderButton({
  label,
  goal,
  order,
  destination,
  expectedRevision,
  action,
  disabled,
}: {
  label: string;
  goal: GoalView;
  order: GoalView[];
  destination: number;
  expectedRevision: number;
  action: (payload: FormData) => void;
  disabled: boolean;
}) {
  const ids = order.map(({ id }) => id);
  if (destination >= 0 && destination < ids.length) {
    [ids[order.indexOf(goal)], ids[destination]] = [
      ids[destination],
      ids[order.indexOf(goal)],
    ];
  }
  return (
    <form action={action}>
      <input type="hidden" name="operation" value="reorder" />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <input type="hidden" name="priorityTier" value={goal.priorityTier} />
      <input type="hidden" name="orderedGoalIds" value={ids.join(",")} />
      <button disabled={disabled}>{label}</button>
    </form>
  );
}

function SimpleAction({
  operation,
  label,
  goal,
  expectedRevision,
  action,
  pending,
}: {
  operation: string;
  label: string;
  goal: GoalView;
  expectedRevision: number;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="goalId" value={goal.id} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <input type="hidden" name="priorityTier" value={goal.priorityTier} />
      <input type="hidden" name="targetRank" value={goal.activeRank ?? ""} />
      <button disabled={pending}>{label}</button>
    </form>
  );
}

const CONFIRMATION_COPY = {
  achieve: {
    confirm: "Confirm achieved",
    consequence:
      "This ends active attention and records the goal as achieved. Reopening it later requires a separate action.",
  },
  abandon: {
    confirm: "Confirm abandoned",
    consequence:
      "This ends active attention and records the goal as abandoned. Reopening it later requires a separate action.",
  },
  archive: {
    confirm: "Confirm archive",
    consequence:
      "This keeps the goal as history and removes it from active use. It will remain in your archive.",
  },
  delete: {
    confirm: "Confirm permanent delete",
    consequence:
      "This permanently deletes an unused goal and cannot be undone. Goals with retained history must be archived instead.",
  },
} as const;

function ConfirmedAction({
  operation,
  label,
  goal,
  expectedRevision,
  action,
  pending,
}: {
  operation: keyof typeof CONFIRMATION_COPY;
  label: string;
  goal: GoalView;
  expectedRevision: number;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  const copy = CONFIRMATION_COPY[operation];
  return (
    <details className={styles.confirmation} data-confirmation={operation}>
      <summary>{label}</summary>
      <p>{copy.consequence}</p>
      <div>
        <SimpleAction
          operation={operation}
          label={copy.confirm}
          goal={goal}
          expectedRevision={expectedRevision}
          action={action}
          pending={pending}
        />
        <button
          type="button"
          onClick={(event) => {
            const details = event.currentTarget.closest("details");
            details?.removeAttribute("open");
            details?.querySelector("summary")?.focus();
          }}
        >
          Cancel
        </button>
      </div>
    </details>
  );
}

function HistorySection({
  title,
  goals,
  expectedRevision,
  action,
  pending,
}: {
  title: string;
  goals: GoalView[];
  expectedRevision: number;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  if (!goals.length) return null;
  return (
    <details className={styles.history}>
      <summary>
        {title} <span>{goals.length}</span>
      </summary>
      <ul>
        {goals.map((goal) => (
          <li key={goal.id}>
            <div>
              <strong>{goal.title}</strong>
              <span>
                {goal.archivedAt ? "archived" : goal.status} ·{" "}
                {goal.priorityTier}
              </span>
            </div>
            {goal.archivedAt ? null : (
              <SimpleAction
                operation={goal.status === "paused" ? "resume" : "reopen"}
                label={goal.status === "paused" ? "Resume" : "Reopen"}
                goal={goal}
                expectedRevision={expectedRevision}
                action={action}
                pending={pending}
              />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * M2-05: the App Router transition carrying a goal mutation's result
 * intermittently never renders, leaving this surface frozen on "Saving goal
 * change…" with stale content and no message. Watching the mutation from
 * outside React tells two cases apart: a reply that arrived but never reached
 * the screen, which a reload settles by showing what is actually saved, and a
 * mutation with no reply at all, which is reported as unconfirmed rather than
 * assumed either way. Neither case can tell whether the change succeeded — the
 * action answers 200 for every outcome — so neither claims it did.
 */
type MutationStall = Exclude<TransitionWatch, "waiting">;

function useMutationStall(
  pending: boolean,
  submission: number,
): MutationStall | null {
  // Keyed by the submission it describes, so a later mutation never inherits
  // an earlier one's verdict and no effect has to reset state.
  const [stall, setStall] = useState<{
    key: string;
    verdict: MutationStall;
  } | null>(null);
  const respondedAt = useRef<number | null>(null);
  // The newest response the previous mutation had already accounted for. See
  // `watchTransition`: this is what makes a reply that beats the pending
  // render detectable.
  const consumedAt = useRef<number | null>(null);
  const key = `${submission}:${pending}`;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (seen === null) return;
      if (respondedAt.current === null || seen > respondedAt.current) {
        respondedAt.current = seen;
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    // A new mutation supersedes any earlier recovery, so the explanation is
    // consumed here. Clearing it from the render path instead would consume
    // the marker in the same document that set it, and the reloaded page
    // would have nothing left to explain itself with.
    markRecovered(false);
    const submittedAt = performance.now();
    let reload = 0;
    const interval = window.setInterval(() => {
      const verdict = watchTransition({
        submittedAt,
        respondedAt: respondedAt.current,
        consumedAt: consumedAt.current,
        now: performance.now(),
      });
      if (verdict === "waiting") return;
      window.clearInterval(interval);
      setStall({ key, verdict });
      if (verdict === "lost-render") {
        // A reply came back and never reached the screen. What it said is
        // unknown — every outcome, including a rejection, answers 200 — so
        // reloading is how the surface shows what is actually saved.
        markRecovered(true);
        reload = window.setTimeout(
          () => window.location.reload(),
          RECOVERY_NOTICE_MS,
        );
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      // Cleanup runs on unmount or when this mutation settles, so a queued
      // reload is always stale by then: the user has navigated away, or the
      // lost transition landed inside the notice window and the result is
      // already on screen.
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [key, pending]);

  return stall?.key === key ? stall.verdict : null;
}

/**
 * The recovery reload replaces the whole surface, so the result message the
 * mutation produced is gone. Saying nothing would leave the reload looking
 * like an unexplained flash, so the reason is carried across it and reported
 * until the next mutation.
 */
function useRecoveredReload(submission: number): boolean {
  // The server has no session storage, so it reports "not recovered" and the
  // client agrees on the first render; hydration cannot mismatch. The marker
  // is consumed by the next mutation, not here.
  const recovered = useSyncExternalStore(
    subscribeNothing,
    readRecovered,
    () => false,
  );
  return recovered && submission === 0;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch {
    // Session storage throws in private browsing and when it is disabled.
    return false;
  }
}

function markRecovered(recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}

function stallNotice(stall: TransitionWatch | null) {
  if (stall === "lost-render") {
    // Says only what is known. A reply arrived and never rendered; whether it
    // saved, was rejected as stale, or failed validation is not observable
    // here, so the reload is what settles it.
    return "This goal change did not appear. Reloading your goals to show what is saved.";
  }
  if (stall === "unconfirmed") {
    return "This goal change has not been confirmed. Reload to see whether it was saved.";
  }
  return null;
}

function byRank(a: GoalView, b: GoalView) {
  return (a.activeRank ?? 0) - (b.activeRank ?? 0);
}

function categoryLabel(category: string) {
  return CATEGORIES.find(([value]) => value === category)?.[1] ?? "Other";
}
