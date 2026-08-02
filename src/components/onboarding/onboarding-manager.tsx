"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { changeOnboardingAction } from "@/app/home/you/onboarding/actions";
import { INITIAL_ONBOARDING_ACTION_STATE } from "@/app/home/you/onboarding/action-state";
import styles from "@/app/home/you/onboarding/onboarding.module.css";
import {
  GOAL_CATEGORIES,
  LIMITATION_CATEGORIES,
  ONBOARDING_STEPS,
  type GoalCandidateView,
  type OnboardingSnapshot,
  type OnboardingStep,
} from "@/lib/onboarding/onboarding-contract";

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "Varies",
] as const;

const LIMITATION_LABELS = {
  pain_injury: "Pain or injury",
  illness_recovery: "Illness or recovery",
  unusual_fatigue: "Unusual fatigue",
  other: "Other constraint",
} as const;

export function OnboardingManager({
  snapshot,
}: {
  snapshot: OnboardingSnapshot;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changeOnboardingAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );
  const [selectedStep, setVisibleStep] = useState<OnboardingStep | null>(null);
  const [goalCount, setGoalCount] = useState(
    Math.max(1, snapshot.goalCandidates.length),
  );
  const [activityCount, setActivityCount] = useState(
    Math.max(1, snapshot.activities.length),
  );
  const [trainingStatus, setTrainingStatus] = useState<"current" | "none">(
    snapshot.draft?.trainingStatus ?? "current",
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const visibleStep =
    selectedStep ??
    (state.submission > 0 ? state.nextStep : undefined) ??
    snapshot.draft?.currentStep ??
    1;

  useEffect(() => {
    if (state.submission === 0) return;
    if (state.redirectTo) {
      router.push(state.redirectTo);
      return;
    }
    router.refresh();
    if (state.status === "published") {
      resultRef.current?.focus();
    } else if (
      state.status === "validation" ||
      state.status === "conflict" ||
      state.status === "session" ||
      state.status === "error"
    ) {
      noticeRef.current?.focus();
    }
  }, [router, state.redirectTo, state.status, state.submission]);

  useEffect(() => {
    if (snapshot.draft && state.status !== "published") {
      headingRef.current?.focus();
    }
  }, [snapshot.draft, visibleStep, state.status]);

  if (state.status === "published") {
    return (
      <section className={styles.result} aria-labelledby="setup-result">
        <p className={styles.eyebrow}>Setup saved</p>
        <h2 id="setup-result" ref={resultRef} tabIndex={-1}>
          Your accepted context is filed.
        </h2>
        <p>
          The draft and its candidate text were deleted. Goals and Memory now
          hold only the items you accepted.
        </p>
        <div className={styles.resultActions}>
          <Link href="/home/you/goals">Goals</Link>
          <Link href="/home/you/memory">Memory</Link>
          <form action={formAction}>
            <input name="operation" type="hidden" value="start" />
            <input name="expectedDraftRevision" type="hidden" value="0" />
            <button disabled={pending}>Run guided review again</button>
          </form>
        </div>
      </section>
    );
  }

  if (!snapshot.draft) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-start">
        <p className={styles.eyebrow}>
          {snapshot.hasPublished ? "Review again" : "Optional setup"}
        </p>
        <h2 id="setup-start">
          {snapshot.hasPublished
            ? "Run a fresh comparison."
            : "Set up your coaching context."}
        </h2>
        <p>
          Your answers are stored in your account so you can resume on another
          device. They are not sent to an AI provider. Setup is optional and
          never blocks planning or logging.
        </p>
        <form action={formAction}>
          <input name="operation" type="hidden" value="start" />
          <input name="expectedDraftRevision" type="hidden" value="0" />
          <button disabled={pending}>
            {snapshot.hasPublished ? "Run guided review again" : "Start setup"}
          </button>
        </form>
        <Link className={styles.quietLink} href="/home/you">
          Back to You
        </Link>
      </section>
    );
  }

  const draft = snapshot.draft;
  const preferences = snapshot.memoryCandidates
    .filter((candidate) => candidate.fieldKey.startsWith("preference:"))
    .map((candidate) => candidate.content)
    .join("\n");
  const limitationDetails = Object.fromEntries(
    LIMITATION_CATEGORIES.map((category) => {
      const candidate = snapshot.memoryCandidates.find(
        (item) => item.fieldKey === `constraint:${category}`,
      );
      return [
        category,
        candidate
          ? stripConstraintPrefix(
              candidate.content,
              LIMITATION_LABELS[category],
            )
          : "",
      ];
    }),
  );
  const rankPreview = buildRankPreview(snapshot);

  return (
    <div className={styles.manager}>
      <nav className={styles.progress} aria-label="Guided setup progress">
        <ol>
          {ONBOARDING_STEPS.map((label, index) => {
            const step = (index + 1) as OnboardingStep;
            return (
              <li
                data-current={visibleStep === step ? "true" : undefined}
                data-saved={draft.currentStep > step ? "true" : undefined}
                key={label}
              >
                <button
                  aria-current={visibleStep === step ? "step" : undefined}
                  disabled={step > draft.currentStep}
                  onClick={() => setVisibleStep(step)}
                  type="button"
                >
                  <span>{step}</span>
                  <strong>{label}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {state.status !== "idle" ? (
        <div
          className={styles.notice}
          data-state={state.status}
          ref={noticeRef}
          role={state.status === "saved" ? "status" : "alert"}
          tabIndex={
            state.status === "validation" ||
            state.status === "conflict" ||
            state.status === "session" ||
            state.status === "error"
              ? -1
              : undefined
          }
        >
          {state.message}
        </div>
      ) : null}

      <header className={styles.stepHeader}>
        <p>
          Step {visibleStep} of 6 · {ONBOARDING_STEPS[visibleStep - 1]}
        </p>
        <h2 ref={headingRef} tabIndex={-1}>
          {stepHeading(visibleStep)}
        </h2>
        <span>
          Draft expires {formatDate(draft.expiresAt)} after 30 inactive days.
        </span>
      </header>

      {visibleStep === 1 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta operation="save_goals" revision={draft.revision} step={1} />
          <p className={styles.explainer}>
            Add one to three outcomes. Goal limits and the three-core boundary
            are the same here as in Goals.
          </p>
          {Array.from({ length: goalCount }, (_, index) => (
            <GoalFields
              candidate={snapshot.goalCandidates[index]}
              index={index}
              key={index}
            />
          ))}
          {goalCount < 3 ? (
            <button
              className={styles.secondaryButton}
              onClick={() => setGoalCount((count) => count + 1)}
              type="button"
            >
              Add another goal
            </button>
          ) : null}
          <StepActions
            currentStep={1}
            first
            pending={pending}
            setVisibleStep={setVisibleStep}
          />
        </form>
      ) : null}

      {visibleStep === 2 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta
            operation="save_training"
            revision={draft.revision}
            step={2}
          />
          <fieldset className={styles.choiceGroup}>
            <legend>Current training answer</legend>
            <label>
              <input
                checked={trainingStatus === "current"}
                name="trainingStatus"
                onChange={() => setTrainingStatus("current")}
                type="radio"
                value="current"
              />
              I am training currently
            </label>
            <label>
              <input
                checked={trainingStatus === "none"}
                name="trainingStatus"
                onChange={() => setTrainingStatus("none")}
                type="radio"
                value="none"
              />
              I am not training currently
            </label>
          </fieldset>
          {trainingStatus === "current" ? (
            <>
              {Array.from({ length: activityCount }, (_, index) => (
                <ActivityFields
                  activity={snapshot.activities[index]}
                  index={index}
                  key={index}
                />
              ))}
              {activityCount < 10 ? (
                <button
                  className={styles.secondaryButton}
                  onClick={() =>
                    setActivityCount((count) => Math.min(10, count + 1))
                  }
                  type="button"
                >
                  Add another activity
                </button>
              ) : null}
            </>
          ) : null}
          <StepActions
            currentStep={2}
            pending={pending}
            setVisibleStep={setVisibleStep}
          />
        </form>
      ) : null}

      {visibleStep === 3 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta
            operation="save_context"
            revision={draft.revision}
            step={3}
          />
          <fieldset className={styles.dayGrid}>
            <legend>Available days</legend>
            {DAY_OPTIONS.map((day) => (
              <label key={day}>
                <input
                  defaultChecked={draft.availableDays.includes(day)}
                  name="availableDays"
                  type="checkbox"
                  value={day}
                />
                {day}
              </label>
            ))}
          </fieldset>
          <div className={styles.fieldGrid}>
            <label>
              Feasible sessions per week
              <input
                defaultValue={draft.sessionsPerWeek ?? 3}
                max="14"
                min="1"
                name="sessionsPerWeek"
                required
                type="number"
              />
            </label>
            <label>
              Typical minutes per session
              <input
                defaultValue={draft.sessionDurationMinutes ?? 45}
                max="1440"
                min="5"
                name="durationMinutes"
                required
                type="number"
              />
            </label>
          </div>
          <label>
            Access and equipment
            <input
              defaultValue={draft.accessLabels.join(", ")}
              maxLength={619}
              name="accessLabels"
              placeholder="Track, gym, none, not sure"
              required
            />
            <small>Up to 10 labels, separated by commas.</small>
          </label>
          <div className={styles.fieldGrid}>
            <label>
              Timezone
              <input
                defaultValue={snapshot.draft?.timezoneName ?? "UTC"}
                maxLength={100}
                name="timezoneName"
                required
              />
            </label>
            <label>
              Units
              <select
                defaultValue={draft.units ?? "metric"}
                name="units"
                required
              >
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </label>
          </div>
          <StepActions
            currentStep={3}
            pending={pending}
            setVisibleStep={setVisibleStep}
          />
        </form>
      ) : null}

      {visibleStep === 4 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta
            operation="save_preferences"
            revision={draft.revision}
            step={4}
          />
          <label>
            Coaching or training preferences
            <textarea
              defaultValue={preferences}
              maxLength={10009}
              name="preferences"
              placeholder={
                "Keep hard sessions short.\nPrefer outdoor training."
              }
              rows={7}
            />
            <small>
              Optional. One memory statement per line, up to 10 lines and 1,000
              characters each.
            </small>
          </label>
          <StepActions
            currentStep={4}
            pending={pending}
            setVisibleStep={setVisibleStep}
          />
        </form>
      ) : null}

      {visibleStep === 5 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta
            operation="save_constraints"
            revision={draft.revision}
            step={5}
          />
          <aside className={styles.privacyNotice}>
            Constraints are optional, health-adjacent account data. They stay in
            your draft until you accept them, and are not sent to an AI
            provider.
          </aside>
          <p className={styles.safetyCopy}>
            FitTip cannot assess or diagnose symptoms. If symptoms are severe,
            sudden, or getting worse, stop the affected activity and contact a
            qualified health professional.
          </p>
          <div className={styles.constraintList}>
            {LIMITATION_CATEGORIES.map((category) => {
              const candidate = snapshot.memoryCandidates.find(
                (item) => item.fieldKey === `constraint:${category}`,
              );
              return (
                <fieldset key={category}>
                  <label className={styles.constraintChoice}>
                    <input
                      defaultChecked={Boolean(candidate)}
                      name={`constraint:${category}`}
                      type="checkbox"
                    />
                    {LIMITATION_LABELS[category]}
                  </label>
                  <label>
                    Optional detail
                    <textarea
                      defaultValue={limitationDetails[category]}
                      maxLength={970}
                      name={`constraintDetail:${category}`}
                      rows={3}
                    />
                  </label>
                </fieldset>
              );
            })}
          </div>
          <StepActions
            currentStep={5}
            pending={pending}
            setVisibleStep={setVisibleStep}
          />
        </form>
      ) : null}

      {visibleStep === 6 ? (
        <form action={formAction} className={styles.stepForm}>
          <input name="operation" type="hidden" value="publish" />
          <input
            name="expectedDraftRevision"
            type="hidden"
            value={draft.revision}
          />
          <input
            name="expectedGoalRevision"
            type="hidden"
            value={snapshot.goalRevision}
          />
          <input
            name="expectedMemoryRevision"
            type="hidden"
            value={snapshot.memoryRevision}
          />
          <input
            name="idempotencyKey"
            type="hidden"
            value={draft.idempotencyKey}
          />
          <p className={styles.explainer}>
            Nothing is preaccepted. Decide every card. Rejected cards stay only
            in this draft and are deleted when publication succeeds.
          </p>
          <section className={styles.contextMap} aria-labelledby="context-map">
            <header>
              <p>Context map</p>
              <h3 id="context-map">Choose where each statement lands.</h3>
            </header>
            <div className={styles.mapLegend}>
              <span data-destination="goals">Goals</span>
              <span data-destination="memory">Memory</span>
            </div>
            {snapshot.goalCandidates.map((candidate) => (
              <ReviewCard
                candidate={candidate}
                destination="Goals"
                key={candidate.id}
                kind="goal"
              />
            ))}
            {snapshot.memoryCandidates.map((candidate) => (
              <ReviewCard
                candidate={candidate}
                destination="Memory"
                key={candidate.id}
                kind="memory"
              />
            ))}
          </section>
          {rankPreview.length ? (
            <section className={styles.rankPreview}>
              <p className={styles.eyebrow}>Full rank preview</p>
              <h3>If every goal card above is accepted</h3>
              <ol>
                {rankPreview.map((goal) => (
                  <li key={goal.key}>
                    <span>{goal.tier}</span>
                    <strong>{goal.title}</strong>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <div className={styles.stepActions}>
            <button
              className={styles.secondaryButton}
              onClick={() => setVisibleStep(5)}
              type="button"
            >
              Back
            </button>
            <button disabled={pending} type="submit">
              Save accepted items
            </button>
          </div>
        </form>
      ) : null}

      <form action={formAction} className={styles.cancelForm}>
        <input name="operation" type="hidden" value="cancel" />
        <input
          name="expectedDraftRevision"
          type="hidden"
          value={draft.revision}
        />
        <button disabled={pending}>Cancel and delete draft</button>
      </form>
    </div>
  );
}

function StepMeta({
  operation,
  revision,
  step,
}: {
  operation: string;
  revision: number;
  step: OnboardingStep;
}) {
  return (
    <>
      <input name="operation" type="hidden" value={operation} />
      <input name="expectedDraftRevision" type="hidden" value={revision} />
      <input name="step" type="hidden" value={step} />
    </>
  );
}

function StepActions({
  currentStep,
  first = false,
  pending,
  setVisibleStep,
}: {
  currentStep: OnboardingStep;
  first?: boolean;
  pending: boolean;
  setVisibleStep: (step: OnboardingStep | null) => void;
}) {
  return (
    <div className={styles.stepActions}>
      {!first ? (
        <button
          className={styles.secondaryButton}
          onClick={() =>
            setVisibleStep(Math.max(1, currentStep - 1) as OnboardingStep)
          }
          type="button"
        >
          Back
        </button>
      ) : null}
      <button
        disabled={pending}
        name="intent"
        onClick={() => setVisibleStep(null)}
        value="finish"
      >
        Save and finish later
      </button>
      <button
        disabled={pending}
        name="intent"
        onClick={() => setVisibleStep(null)}
        value="continue"
      >
        Save and continue
      </button>
    </div>
  );
}

function GoalFields({
  candidate,
  index,
}: {
  candidate?: GoalCandidateView;
  index: number;
}) {
  return (
    <fieldset className={styles.entryCard}>
      <legend>Goal {index + 1}</legend>
      <label>
        Goal title
        <input
          defaultValue={candidate?.title ?? ""}
          maxLength={120}
          name={`goalTitle:${index}`}
          required={index === 0}
        />
      </label>
      <label>
        Desired outcome
        <textarea
          defaultValue={candidate?.desiredOutcome ?? ""}
          maxLength={1000}
          name={`goalOutcome:${index}`}
          required={index === 0}
          rows={4}
        />
      </label>
      <div className={styles.fieldGrid}>
        <label>
          Category
          <select
            defaultValue={candidate?.category ?? "other"}
            name={`goalCategory:${index}`}
          >
            {GOAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Attention tier
          <select
            defaultValue={candidate?.priorityTier ?? "core"}
            name={`goalTier:${index}`}
          >
            <option value="core">Core</option>
            <option value="supporting">Supporting</option>
          </select>
        </label>
      </div>
      <label>
        Activity areas
        <input
          defaultValue={candidate?.activityAreas.join(", ") ?? ""}
          name={`goalActivities:${index}`}
          placeholder="Running, strength"
        />
      </label>
      <div className={styles.fieldGrid}>
        <label>
          Start date
          <input
            defaultValue={candidate?.startDate ?? today()}
            name={`goalStartDate:${index}`}
            required={index === 0}
            type="date"
          />
        </label>
        <label>
          Target date
          <input
            defaultValue={candidate?.targetDate ?? ""}
            name={`goalTargetDate:${index}`}
            type="date"
          />
        </label>
      </div>
      <label>
        Target detail
        <textarea
          defaultValue={candidate?.targetDetail ?? ""}
          maxLength={500}
          name={`goalTargetDetail:${index}`}
          rows={2}
        />
      </label>
      <div className={styles.metricGrid}>
        <label>
          Metric
          <input
            defaultValue={candidate?.targetMetricLabel ?? ""}
            maxLength={80}
            name={`goalMetricLabel:${index}`}
          />
        </label>
        <label>
          Value
          <input
            defaultValue={candidate?.targetMetricValue ?? ""}
            maxLength={120}
            name={`goalMetricValue:${index}`}
          />
        </label>
        <label>
          Unit
          <input
            defaultValue={candidate?.targetMetricUnit ?? ""}
            maxLength={40}
            name={`goalMetricUnit:${index}`}
          />
        </label>
      </div>
      <div className={styles.fieldGrid}>
        <label>
          Rank
          <input
            defaultValue={candidate?.targetRank ?? index + 1}
            min="1"
            name={`goalRank:${index}`}
            type="number"
          />
        </label>
        <label>
          Rationale
          <input
            defaultValue={candidate?.rationale ?? ""}
            maxLength={500}
            name={`goalRationale:${index}`}
          />
        </label>
      </div>
      <label>
        Constraints tied to this goal
        <textarea
          defaultValue={candidate?.constraints ?? ""}
          maxLength={1000}
          name={`goalConstraints:${index}`}
          rows={2}
        />
      </label>
    </fieldset>
  );
}

function ActivityFields({
  activity,
  index,
}: {
  activity?: OnboardingSnapshot["activities"][number];
  index: number;
}) {
  return (
    <fieldset className={styles.entryCard}>
      <legend>Activity {index + 1}</legend>
      <label>
        Activity name
        <input
          defaultValue={activity?.name ?? ""}
          maxLength={60}
          name={`activityName:${index}`}
          required={index === 0}
        />
      </label>
      <div className={styles.fieldGrid}>
        <label>
          Sessions per week
          <input
            defaultValue={activity?.sessionsPerWeek ?? 2}
            max="14"
            min="1"
            name={`activitySessions:${index}`}
            type="number"
          />
        </label>
        <label>
          Typical minutes
          <input
            defaultValue={activity?.durationMinutes ?? 45}
            max="1440"
            min="1"
            name={`activityDuration:${index}`}
            type="number"
          />
        </label>
      </div>
      <label>
        Short baseline detail
        <textarea
          defaultValue={activity?.detail ?? ""}
          maxLength={500}
          name={`activityDetail:${index}`}
          rows={3}
        />
      </label>
    </fieldset>
  );
}

function ReviewCard({
  candidate,
  destination,
  kind,
}: {
  candidate:
    | OnboardingSnapshot["goalCandidates"][number]
    | OnboardingSnapshot["memoryCandidates"][number];
  destination: "Goals" | "Memory";
  kind: "goal" | "memory";
}) {
  const comparison = candidate.comparison;
  const label =
    kind === "goal"
      ? (candidate as GoalCandidateView).title
      : (candidate as OnboardingSnapshot["memoryCandidates"][number]).content;
  const detail =
    kind === "goal" ? (candidate as GoalCandidateView).desiredOutcome : null;
  const defaultDecision =
    candidate.decision === "pending" ? "" : candidate.decision;
  const defaultResolution =
    candidate.resolution ??
    (comparison.kind === "new"
      ? "create"
      : comparison.kind === "exact"
        ? "keep"
        : "update");

  return (
    <article className={styles.reviewCard}>
      <input name="candidateId" type="hidden" value={candidate.id} />
      <input name={`kind:${candidate.id}`} type="hidden" value={kind} />
      <span
        className={styles.destinationStamp}
        data-destination={destination.toLocaleLowerCase()}
      >
        {destination}
      </span>
      <h4>{label}</h4>
      {detail ? <p>{detail}</p> : null}
      {comparison.kind !== "new" ? (
        <div className={styles.comparison}>
          <p>
            {comparison.kind === "exact"
              ? "Already saved"
              : "Different from what’s saved"}
          </p>
          <strong>{comparison.existingLabel}</strong>
          <span>{comparison.existingDetail}</span>
        </div>
      ) : null}
      <label>
        Decision
        <select
          defaultValue={defaultDecision}
          name={`decision:${candidate.id}`}
          required
        >
          <option disabled value="">
            Choose
          </option>
          <option value="accepted">Accept</option>
          <option value="rejected">Reject</option>
        </select>
      </label>
      {comparison.kind === "conflict" ? (
        <label>
          If accepted
          <select
            defaultValue={defaultResolution}
            name={`resolution:${candidate.id}`}
          >
            <option value="update">Update what’s saved</option>
            <option value="keep">Keep what’s saved</option>
          </select>
        </label>
      ) : (
        <input
          name={`resolution:${candidate.id}`}
          type="hidden"
          value={defaultResolution}
        />
      )}
      <input
        name={`targetId:${candidate.id}`}
        type="hidden"
        value={comparison.targetId ?? ""}
      />
    </article>
  );
}

function buildRankPreview(snapshot: OnboardingSnapshot) {
  const result = snapshot.activeGoalOrder.map((goal) => ({
    key: goal.id,
    title: goal.title,
    tier: goal.priorityTier,
    rank: goal.activeRank,
  }));
  for (const candidate of snapshot.goalCandidates) {
    if (
      candidate.comparison.targetId &&
      candidate.comparison.kind === "conflict"
    ) {
      const existingIndex = result.findIndex(
        (goal) => goal.key === candidate.comparison.targetId,
      );
      if (existingIndex >= 0) result.splice(existingIndex, 1);
    } else if (candidate.comparison.kind === "exact") {
      continue;
    }
    result.push({
      key: candidate.id,
      title: candidate.title,
      tier: candidate.priorityTier,
      rank:
        candidate.targetRank ??
        result.filter((goal) => goal.tier === candidate.priorityTier).length +
          1,
    });
  }
  return result.sort(
    (left, right) =>
      left.tier.localeCompare(right.tier) || left.rank - right.rank,
  );
}

function stepHeading(step: OnboardingStep) {
  const headings = {
    1: "Name the outcomes.",
    2: "Record the baseline.",
    3: "Set the feasible frame.",
    4: "State what helps.",
    5: "Name constraints, if useful.",
    6: "File only what you accept.",
  } satisfies Record<OnboardingStep, string>;
  return headings[step];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stripConstraintPrefix(content: string, label: string) {
  if (content === `${label}.`) return "";
  return content.startsWith(`${label}: `)
    ? content.slice(label.length + 2)
    : content;
}
