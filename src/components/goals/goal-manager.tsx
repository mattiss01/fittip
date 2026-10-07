"use client";

import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  INITIAL_GOAL_ACTION_STATE,
  type GoalActionDraft,
  type GoalActionState,
} from "@/app/home/you/goals/action-state";
import { changeGoalAction } from "@/app/home/you/goals/actions";
import { SheetCloseButton, SheetLayer } from "@/app/home/plan/plan-sheet";
import sheetStyles from "@/app/home/plan/plan-week.module.css";
import styles from "@/app/home/you/goals/goals.module.css";
import { DateField } from "@/components/date-field/date-field";
import { formatRoadmapDate } from "@/components/roadmap/roadmap-dates";
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
  sports: string[];
  targetDate: string | null;
  priorityTier: "core" | "supporting";
  status: "active" | "paused" | "achieved" | "abandoned";
  activeRank: number | null;
  /**
   * The owner-local day the goal was paused, achieved or abandoned. Absent
   * for an active goal.
   */
  statusDate?: string | null;
};

type Props = {
  initialGoals: GoalView[];
  expectedRevision: number;
};

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
  const [adding, setAdding] = useState(false);
  // The add form closes once its goal is created and stays open on a refusal.
  const [settled, setSettled] = useState(state.submission);
  if (state.submission !== settled) {
    setSettled(state.submission);
    if (state.status === "saved" && state.operation === "create") {
      setAdding(false);
    }
  }
  const stall = useMutationStall(pending, state.submission);
  const recovered = useRecoveredReload(state.submission);
  const notice =
    stallNotice(stall) ??
    (pending ? "Saving goal change…" : null) ??
    (recovered ? RECOVERED_NOTICE : null);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);
  const active = initialGoals.filter((goal) => goal.status === "active");
  const core = active
    .filter((goal) => goal.priorityTier === "core")
    .toSorted(byRank);
  const supporting = active
    .filter((goal) => goal.priorityTier === "supporting")
    .toSorted(byRank);
  const paused = initialGoals.filter((goal) => goal.status === "paused");
  const historical = initialGoals.filter(
    (goal) => goal.status === "achieved" || goal.status === "abandoned",
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

      {/* First on the page, not under both lists (owner, 2 Oct 2026), and a
          button of its own width that opens the form (owner, 5 Oct 2026). */}
      {adding ? (
        <section className={styles.addPanel} aria-label="Add goal">
          <GoalForm
            // Remounted by its own result only: a reorder sent while this
            // is open must not empty what has been typed.
            key={`create-${state.operation === "create" ? state.submission : 0}`}
            action={action}
            expectedRevision={expectedRevision}
            pending={pending}
            draft={state.operation === "create" ? state.draft : undefined}
            newGoalTier={core.length < 3 ? "core" : "supporting"}
            onCancel={() => setAdding(false)}
          />
        </section>
      ) : (
        <button
          className={styles.add}
          onClick={() => setAdding(true)}
          type="button"
        >
          Add goal
        </button>
      )}

      <section className={styles.attention} aria-labelledby="core-heading">
        <div className={styles.sectionHeading}>
          <h2 id="core-heading">Core goals</h2>
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
          <GoalList
            goals={core}
            tier="core"
            expectedRevision={expectedRevision}
            action={action}
            actionState={state}
            pending={pending}
          />
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
          <h2 id="supporting-heading">Supporting goals</h2>
        </div>
        {supporting.length ? (
          <GoalList
            goals={supporting}
            tier="supporting"
            expectedRevision={expectedRevision}
            action={action}
            actionState={state}
            pending={pending}
          />
        ) : (
          <p className={styles.empty}>None yet.</p>
        )}
      </section>

      <HistorySection
        title="Paused"
        goals={paused}
        expectedRevision={expectedRevision}
        action={action}
        pending={pending}
      />
      <HistorySection
        title="History"
        goals={historical}
        expectedRevision={expectedRevision}
        action={action}
        pending={pending}
      />
    </div>
  );
}

type Drag = {
  id: string;
  from: number;
  to: number;
  dy: number;
  startY: number;
  /** Each card's vertical centre and the dragged card's height, at the start. */
  centres: number[];
  height: number;
};

/**
 * One ranked list. A card is moved by dragging its number, or with the arrow
 * keys while the number has focus, in place of Move up and Move down (owner,
 * 5 Oct 2026). The new order shows at once and is sent as one reorder; if the
 * server refuses it the list falls back to what is saved.
 */
function GoalList({
  goals,
  tier,
  expectedRevision,
  action,
  actionState,
  pending,
}: {
  goals: GoalView[];
  tier: GoalView["priorityTier"];
  expectedRevision: number;
  action: (payload: FormData) => void;
  actionState: GoalActionState;
  pending: boolean;
}) {
  const [, startTransition] = useTransition();
  const [shown, showOrder] = useOptimistic(
    goals,
    (_saved, next: GoalView[]) => next,
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  // One editor at a time in a list. It closes on its own goal's save and
  // stays open on a refusal, so what was typed is still there to correct.
  // While it is open the list is not reordered and shows no grips (owner,
  // 5 Oct 2026): an open card is too tall to drag past its neighbours.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settled, setSettled] = useState(actionState.submission);
  if (actionState.submission !== settled) {
    setSettled(actionState.submission);
    if (actionState.status === "saved" && actionState.goalId === editingId) {
      setEditingId(null);
    }
  }
  const cards = useRef(new Map<string, HTMLLIElement>());
  // Nothing can move in a list of one, or while a card is open.
  const fixed = shown.length < 2 || editingId !== null;
  const locked = fixed || pending;

  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= shown.length || to === from) return;
    const next = [...shown];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const payload = new FormData();
    payload.set("operation", "reorder");
    payload.set("expectedRevision", String(expectedRevision));
    payload.set("priorityTier", tier);
    payload.set("orderedGoalIds", next.map(({ id }) => id).join(","));
    startTransition(() => {
      showOrder(next);
      action(payload);
    });
  };

  const begin = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    from: number,
  ) => {
    if (locked || event.button !== 0) return;
    const rects = shown.map((goal) =>
      cards.current.get(goal.id)?.getBoundingClientRect(),
    );
    const own = rects[from];
    if (!own || rects.some((rect) => !rect)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      from,
      to: from,
      dy: 0,
      startY: event.clientY,
      centres: rects.map((rect) => (rect ? rect.top + rect.height / 2 : 0)),
      height: own.height,
    });
  };

  const follow = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag) setDrag({ ...drag, ...dragTarget(drag, event.clientY) });
  };

  // Where the card lands is read from the release itself, not from the last
  // move React happened to have rendered.
  const drop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    setDrag(null);
    move(drag.from, dragTarget(drag, event.clientY).to);
  };

  return (
    <ol className={styles.goalList} data-reordering={drag ? "true" : undefined}>
      {shown.map((goal, index) => (
        <li
          className={styles.goalCard}
          data-dragging={drag?.id === goal.id ? "true" : undefined}
          key={goal.id}
          ref={(element) => {
            if (element) cards.current.set(goal.id, element);
            else cards.current.delete(goal.id);
          }}
          style={dragOffset(drag, index)}
        >
          <button
            aria-label={`${goal.title}: rank ${index + 1} of ${shown.length}. Drag or use the arrow keys to reorder.`}
            // Not `disabled`: that would drop the focus a second arrow key
            // needs, on every move.
            aria-disabled={locked}
            className={styles.rank}
            data-fixed={fixed ? "true" : undefined}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              move(index, event.key === "ArrowUp" ? index - 1 : index + 1);
            }}
            onLostPointerCapture={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onPointerDown={(event) => begin(event, goal.id, index)}
            onPointerMove={follow}
            onPointerUp={drop}
            type="button"
          >
            {String(index + 1).padStart(2, "0")}
            <svg aria-hidden="true" height="14" viewBox="0 0 10 14" width="10">
              {[2, 7, 12].flatMap((y) =>
                [2, 8].map((x) => (
                  <circle
                    cx={x}
                    cy={y}
                    fill="currentColor"
                    key={`${x}-${y}`}
                    r="1.3"
                  />
                )),
              )}
            </svg>
          </button>
          <GoalCard
            goal={goal}
            expectedRevision={expectedRevision}
            action={action}
            actionState={actionState}
            pending={pending}
            editing={editingId === goal.id}
            onEditing={(open) => setEditingId(open ? goal.id : null)}
          />
        </li>
      ))}
    </ol>
  );
}

/** How far the card has been dragged and the place that puts it in. */
function dragTarget(drag: Drag, clientY: number) {
  const dy = clientY - drag.startY;
  const centre = drag.centres[drag.from] + dy;
  let to = drag.from;
  while (to < drag.centres.length - 1 && centre > drag.centres[to + 1]) to += 1;
  while (to > 0 && centre < drag.centres[to - 1]) to -= 1;
  return { dy, to };
}

/** The dragged card follows the finger; the ones it passes step aside. */
function dragOffset(
  drag: Drag | null,
  index: number,
): CSSProperties | undefined {
  if (!drag) return undefined;
  if (index === drag.from) return { transform: `translateY(${drag.dy}px)` };
  if (drag.from < drag.to && index > drag.from && index <= drag.to) {
    return { transform: `translateY(${-drag.height}px)` };
  }
  if (drag.to < drag.from && index >= drag.to && index < drag.from) {
    return { transform: `translateY(${drag.height}px)` };
  }
  return undefined;
}

function GoalCard({
  goal,
  expectedRevision,
  action,
  actionState,
  pending,
  editing,
  onEditing,
}: {
  goal: GoalView;
  expectedRevision: number;
  action: (payload: FormData) => void;
  actionState: GoalActionState;
  pending: boolean;
  editing: boolean;
  onEditing: (open: boolean) => void;
}) {
  const ownEdit =
    actionState.operation === "edit" && actionState.goalId === goal.id;
  // What can be done to a goal besides editing it sits behind "⋯", beside
  // Edit, in a bottom sheet (owner, 7 Oct 2026). It closes once its change
  // is answered; a refusal is then read on the page, where the notice is.
  const [menuOpen, setMenuOpen] = useState(false);
  const [settled, setSettled] = useState(actionState.submission);
  if (actionState.submission !== settled) {
    setSettled(actionState.submission);
    setMenuOpen(false);
  }
  const menuTitleId = `goal-menu-${goal.id}`;

  return (
    <div className={styles.goalBody}>
      {/* The list a card sits in says core or supporting, so the card does
          not repeat it; the kind-of-goal label left with its field (owner,
          5 Oct 2026). */}
      <h3>{goal.title}</h3>
      <p className={styles.outcome}>{goal.desiredOutcome}</p>
      {goal.sports.length || goal.targetDate ? (
        <p className={styles.areas}>
          {[
            ...goal.sports,
            ...(goal.targetDate
              ? [`By ${formatRoadmapDate(goal.targetDate)}`]
              : []),
          ].join(" · ")}
        </p>
      ) : null}
      <div className={styles.controls}>
        {editing ? null : (
          <button
            className={styles.edit}
            onClick={() => onEditing(true)}
            type="button"
          >
            Edit
          </button>
        )}
        {editing ? null : (
          <button
            aria-haspopup="dialog"
            aria-label={`More for ${goal.title}`}
            className={styles.more}
            onClick={() => setMenuOpen(true)}
            type="button"
          >
            ⋯
          </button>
        )}
      </div>
      {editing ? (
        <div className={styles.detail} data-goal-editor>
          <GoalForm
            key={`edit-${goal.id}-${ownEdit ? actionState.submission : 0}`}
            action={action}
            expectedRevision={expectedRevision}
            goal={goal}
            pending={pending}
            draft={ownEdit ? actionState.draft : undefined}
            onCancel={() => onEditing(false)}
          />
        </div>
      ) : null}
      {menuOpen ? (
        <SheetLayer
          view="goal-actions"
          labelledBy={menuTitleId}
          onClose={() => setMenuOpen(false)}
        >
          <header className={sheetStyles.sheetHead}>
            <span />
            <SheetCloseButton className={sheetStyles.sheetClose}>
              Close
            </SheetCloseButton>
          </header>
          <h2 id={menuTitleId}>{goal.title}</h2>
          <div className={`${styles.lifecycle} ${styles.menu}`}>
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
              label="Achieved"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <ConfirmedAction
              operation="abandon"
              label="Abandoned"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            {/* No Archive (owner, 2 Oct 2026): beside Pause and Abandoned it
                was a third way to set a goal aside, and the only one that
                could not be undone. */}
            <ConfirmedAction
              operation="delete"
              label="Delete"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          </div>
        </SheetLayer>
      ) : null}
    </div>
  );
}

function GoalForm({
  action,
  expectedRevision,
  goal,
  pending,
  draft,
  newGoalTier = "supporting",
  onCancel,
}: {
  action: (payload: FormData) => void;
  expectedRevision: number;
  goal?: GoalView;
  pending: boolean;
  draft?: GoalActionDraft;
  newGoalTier?: GoalView["priorityTier"];
  onCancel?: () => void;
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
      {/* Empty until the owner names one: no "Other" to leave standing
          (owner, 5 Oct 2026). */}
      <label>
        Sports
        <input
          name="sports"
          required
          maxLength={600}
          placeholder="Running, strength"
          defaultValue={initial("sports", goal?.sports.join(", "))}
        />
      </label>
      {/* Typed, or picked from the calendar beside it (owner, 5 Oct 2026). */}
      <DateField
        calendar
        initial={initial("targetDate", goal?.targetDate ?? "") || null}
        label="Target date (optional)"
        name="targetDate"
      />
      {/* Chosen when adding and changed here when editing (owner, 5 Oct
          2026). A new goal starts on core while a core slot is free. */}
      <fieldset className={styles.attentionChoice}>
        <legend>Attention</legend>
        {(["core", "supporting"] as const).map((tier) => (
          <label key={tier}>
            <input
              defaultChecked={
                initial("priorityTier", goal?.priorityTier ?? newGoalTier) ===
                tier
              }
              name="priorityTier"
              type="radio"
              value={tier}
            />
            {tier === "core" ? "Core" : "Supporting"}
          </label>
        ))}
      </fieldset>
      <input name="targetRank" type="hidden" value={goal?.activeRank ?? ""} />
      <div className={styles.formActions}>
        <button className={styles.primary} disabled={pending}>
          {goal ? "Save goal" : "Create active goal"}
        </button>
        {onCancel ? (
          <button className={styles.cancel} onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
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
  delete: {
    confirm: "Confirm permanent delete",
    consequence: "This permanently deletes the goal and cannot be undone.",
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
        {/* A count, set apart: run together it read "Paused1" (owner,
            2 Oct 2026), to the eye and to a screen reader. */}
        {title} <span className={styles.count}>{goals.length}</span>
      </summary>
      <ul>
        {goals.map((goal) => (
          <li key={goal.id}>
            <div>
              <strong>{goal.title}</strong>
              <span>
                {statusLine(goal)} · {goal.priorityTier}
              </span>
            </div>
            <SimpleAction
              operation={goal.status === "paused" ? "resume" : "reopen"}
              label={goal.status === "paused" ? "Resume" : "Reopen"}
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            {/* Any goal can be deleted, a finished one included (owner,
                7 Oct 2026). */}
            <ConfirmedAction
              operation="delete"
              label="Delete"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "Achieved on 2 Oct 2026". Spelled by hand rather than through Intl, whose
 * output differs between the server and the browser and so fails hydration.
 * Without a logged day it is the status alone, never a guessed date.
 */
function statusLine(goal: GoalView) {
  const label = goal.status.charAt(0).toUpperCase() + goal.status.slice(1);
  const date = goal.statusDate;
  if (!date) return label;
  return `${label} on ${Number(date.slice(8, 10))} ${
    MONTHS[Number(date.slice(5, 7)) - 1]
  } ${date.slice(0, 4)}`;
}

function byRank(a: GoalView, b: GoalView) {
  return (a.activeRank ?? 0) - (b.activeRank ?? 0);
}
