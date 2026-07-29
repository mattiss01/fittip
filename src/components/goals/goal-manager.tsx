"use client";

import { useActionState } from "react";

import {
  INITIAL_GOAL_ACTION_STATE,
  type GoalActionDraft,
  type GoalActionState,
} from "@/app/home/you/goals/action-state";
import { changeGoalAction } from "@/app/home/you/goals/actions";
import styles from "@/app/home/you/goals/goals.module.css";

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

export function GoalManager({ initialGoals, expectedRevision }: Props) {
  const [state, action, pending] = useActionState(
    changeGoalAction,
    INITIAL_GOAL_ACTION_STATE,
  );
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
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={state.status}
        role="status"
        aria-live="polite"
      >
        {pending ? "Saving goal change…" : state.message}
      </p>

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
        <details className={styles.detail}>
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
            <SimpleAction
              operation="achieve"
              label="Mark achieved"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <SimpleAction
              operation="abandon"
              label="Mark abandoned"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <SimpleAction
              operation="archive"
              label="Archive"
              goal={goal}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
            <SimpleAction
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

function byRank(a: GoalView, b: GoalView) {
  return (a.activeRank ?? 0) - (b.activeRank ?? 0);
}

function categoryLabel(category: string) {
  return CATEGORIES.find(([value]) => value === category)?.[1] ?? "Other";
}
