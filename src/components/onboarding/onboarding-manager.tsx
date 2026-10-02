"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { changeOnboardingAction } from "@/app/home/you/onboarding/actions";
import {
  INITIAL_ONBOARDING_ACTION_STATE,
  type OnboardingActionState,
} from "@/app/home/you/onboarding/action-state";
import styles from "@/app/home/you/onboarding/onboarding.module.css";
import {
  GOAL_CATEGORIES,
  LIMITATION_CATEGORIES,
  ONBOARDING_STEPS,
  type GoalCandidateView,
  type OnboardingResolution,
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

type ReviewSelection = {
  decision: "" | "accepted" | "rejected";
  resolution: OnboardingResolution;
};

type ReviewSelections = Record<string, ReviewSelection>;

export function OnboardingActionNotice({
  state,
}: {
  state: OnboardingActionState;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.submission > 0 && isActionErrorStatus(state.status)) {
      noticeRef.current?.focus();
    }
  }, [state.status, state.submission]);

  // A start says nothing: the first step appearing is the answer (owner,
  // 2 Oct 2026). Every other result has a message.
  if (
    state.status === "idle" ||
    state.status === "published" ||
    state.message === ""
  ) {
    return null;
  }

  return (
    <div
      className={styles.notice}
      data-onboarding-notice
      data-state={state.status}
      ref={noticeRef}
      role={state.status === "saved" ? "status" : "alert"}
      tabIndex={isActionErrorStatus(state.status) ? -1 : undefined}
    >
      {state.message}
    </div>
  );
}

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
  // A saved step goes where its result says. This is done on the result, not
  // on the button's click: clearing the selection there unmounted a revisited
  // step's form before it was sent, so nothing was saved and "Save and finish
  // later" never left the setup (owner, 2 Oct 2026). The step is pinned, not
  // cleared: a save refused on it afterwards names no next step, and without
  // a selection the owner would be thrown to the draft's furthest step with
  // this step's notice over it.
  const [settled, setSettled] = useState(0);
  if (state.submission !== settled) {
    setSettled(state.submission);
    if (state.status === "saved") setVisibleStep(state.nextStep ?? null);
  }
  const [goalCount, setGoalCount] = useState(
    Math.max(1, snapshot.goalCandidates.length),
  );
  const [activityCount, setActivityCount] = useState(
    Math.max(1, snapshot.activities.length),
  );
  const [trainingStatus, setTrainingStatus] = useState<"current" | "none">(
    snapshot.draft?.trainingStatus ?? "current",
  );
  const [reviewSelections, setReviewSelections] = useState<ReviewSelections>(
    () => buildReviewSelections(snapshot),
  );
  const activeReviewSelections = reconcileReviewSelections(
    snapshot,
    reviewSelections,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const visibleStep =
    selectedStep ??
    (state.submission > 0 ? state.nextStep : undefined) ??
    snapshot.draft?.currentStep ??
    1;

  useEffect(() => {
    if (state.submission === 0) return;
    router.refresh();
  }, [router, state.submission]);

  useEffect(() => {
    if (
      snapshot.draft &&
      state.status !== "published" &&
      !isActionErrorStatus(state.status)
    ) {
      headingRef.current?.focus();
    }
  }, [snapshot.draft, visibleStep, state.status]);

  // Done once, setup is not offered again (owner, 2 Oct 2026): everything it
  // filed can be changed where it lives. A draft begun before that rule is
  // still shown below, so it can be finished or cancelled.
  if (!snapshot.draft && snapshot.hasPublished) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-done">
        <p className={styles.eyebrow}>Setup done</p>
        <h2 id="setup-done">Your setup is finished.</h2>
        <p>What you accepted is in Goals and Memory. Change anything there.</p>
        <div className={styles.resultActions}>
          <Link href="/home/you/goals">Goals</Link>
          <Link href="/home/you/memory">Memory</Link>
        </div>
      </section>
    );
  }

  if (!snapshot.draft) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-start">
        <p className={styles.eyebrow}>Optional setup</p>
        <h2 id="setup-start">Set up your coaching context.</h2>
        <p>
          Your answers are stored in your account so you can resume on another
          device. They are not sent to an AI provider. Setup is optional and
          never blocks planning or logging.
        </p>
        <form action={formAction}>
          <input name="operation" type="hidden" value="start" />
          <input name="expectedDraftRevision" type="hidden" value="0" />
          <button disabled={pending}>Start setup</button>
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
  const rankPreview = buildRankPreview(snapshot, activeReviewSelections);
  const coreGoalCount = rankPreview.filter(
    (goal) => goal.tier === "core",
  ).length;

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

      <OnboardingActionNotice state={state} />

      <header className={styles.stepHeader}>
        <p>
          Step {visibleStep} of 6 · {ONBOARDING_STEPS[visibleStep - 1]}
        </p>
        <h2 ref={headingRef} tabIndex={-1}>
          {stepHeading(visibleStep)}
        </h2>
        {/* When the draft expires is said where it matters: on You, after
            "Save and finish later" (owner, 2 Oct 2026). */}
      </header>

      {visibleStep === 1 ? (
        <form action={formAction} className={styles.stepForm}>
          <StepMeta operation="save_goals" revision={draft.revision} step={1} />
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
              <TimezoneSelect saved={snapshot.draft?.timezoneName ?? null} />
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
            A card you have not decided starts accepted. Reject what you do not
            want kept. Rejected cards stay only in this draft and are deleted
            when you save.
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
                onSelectionChange={(selection) =>
                  setReviewSelections((current) =>
                    reconcileReviewSelections(snapshot, {
                      ...current,
                      [candidate.id]: selection,
                    }),
                  )
                }
                selection={
                  activeReviewSelections[candidate.id] ??
                  defaultReviewSelection(candidate)
                }
              />
            ))}
            {snapshot.memoryCandidates.map((candidate) => (
              <ReviewCard
                candidate={candidate}
                destination="Memory"
                key={candidate.id}
                kind="memory"
                onSelectionChange={(selection) =>
                  setReviewSelections((current) =>
                    reconcileReviewSelections(snapshot, {
                      ...current,
                      [candidate.id]: selection,
                    }),
                  )
                }
                selection={
                  activeReviewSelections[candidate.id] ??
                  defaultReviewSelection(candidate)
                }
              />
            ))}
          </section>
          {rankPreview.length ? (
            <section className={styles.rankPreview}>
              <p className={styles.eyebrow}>Full rank preview</p>
              <h3>Result from your current choices</h3>
              {coreGoalCount > 3 ? (
                <p role="alert">
                  These choices would create {coreGoalCount} core goals. Reduce
                  the result to at most three before publication.
                </p>
              ) : null}
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
            {/* More than three core goals is refused when saving, with a
                message about another tab. With every card accepted from the
                start this is the first thing some owners see, so the button
                waits for the count the notice above asks for. */}
            <button disabled={pending || coreGoalCount > 3} type="submit">
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
      {/* Leaving must not wait on a field: the browser's own check is off
          for this button, and the action leaves even when the step is not
          complete enough to save. */}
      <button disabled={pending} formNoValidate name="intent" value="finish">
        Save and finish later
      </button>
      <button disabled={pending} name="intent" value="continue">
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
  onSelectionChange,
  selection,
}: {
  candidate:
    | OnboardingSnapshot["goalCandidates"][number]
    | OnboardingSnapshot["memoryCandidates"][number];
  destination: "Goals" | "Memory";
  kind: "goal" | "memory";
  onSelectionChange: (selection: ReviewSelection) => void;
  selection: ReviewSelection;
}) {
  const comparison = candidate.comparison;
  const label =
    kind === "goal"
      ? (candidate as GoalCandidateView).title
      : (candidate as OnboardingSnapshot["memoryCandidates"][number]).content;
  const detail =
    kind === "goal" ? (candidate as GoalCandidateView).desiredOutcome : null;

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
          {comparison.existingStatus &&
          comparison.existingStatus !== "active" ? (
            <span>
              Saved status: {comparison.existingStatus}. Accepting updates this
              to active Memory.
            </span>
          ) : null}
        </div>
      ) : null}
      <label>
        Decision
        <select
          name={`decision:${candidate.id}`}
          onChange={(event) =>
            onSelectionChange({
              ...selection,
              decision: event.target.value as ReviewSelection["decision"],
            })
          }
          required
          value={selection.decision}
        >
          <option value="accepted">Accept</option>
          <option value="rejected">Reject</option>
        </select>
      </label>
      {comparison.kind === "conflict" ? (
        <label>
          If accepted
          <select
            name={`resolution:${candidate.id}`}
            onChange={(event) =>
              onSelectionChange({
                ...selection,
                resolution: event.target.value as OnboardingResolution,
              })
            }
            value={selection.resolution}
          >
            <option value="update">Update what’s saved</option>
            {comparison.existingStatus === null ||
            comparison.existingStatus === "active" ? (
              <option value="keep">Keep what’s saved</option>
            ) : null}
          </select>
        </label>
      ) : (
        <input
          name={`resolution:${candidate.id}`}
          type="hidden"
          value={selection.resolution}
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

export function buildRankPreview(
  snapshot: OnboardingSnapshot,
  selections: ReviewSelections = buildReviewSelections(snapshot),
) {
  const result = {
    core: snapshot.activeGoalOrder
      .filter((goal) => goal.priorityTier === "core")
      .sort((left, right) => left.activeRank - right.activeRank)
      .map((goal) => ({ key: goal.id, title: goal.title })),
    supporting: snapshot.activeGoalOrder
      .filter((goal) => goal.priorityTier === "supporting")
      .sort((left, right) => left.activeRank - right.activeRank)
      .map((goal) => ({ key: goal.id, title: goal.title })),
  };
  for (const candidate of [...snapshot.goalCandidates].sort(
    (left, right) => left.position - right.position,
  )) {
    const selection =
      selections[candidate.id] ?? defaultReviewSelection(candidate);
    if (
      selection.decision !== "accepted" ||
      (selection.resolution !== "create" && selection.resolution !== "update")
    ) {
      continue;
    }
    if (candidate.comparison.targetId && selection.resolution === "update") {
      for (const tier of [result.core, result.supporting]) {
        const existingIndex = tier.findIndex(
          (goal) => goal.key === candidate.comparison.targetId,
        );
        if (existingIndex >= 0) tier.splice(existingIndex, 1);
      }
    }
    const tier = result[candidate.priorityTier];
    const targetIndex = Math.min(
      Math.max((candidate.targetRank ?? tier.length + 1) - 1, 0),
      tier.length,
    );
    tier.splice(targetIndex, 0, {
      key: candidate.id,
      title: candidate.title,
    });
  }
  return (["core", "supporting"] as const).flatMap((tier) =>
    result[tier].map((goal, index) => ({
      ...goal,
      tier,
      rank: index + 1,
    })),
  );
}

function buildReviewSelections(snapshot: OnboardingSnapshot): ReviewSelections {
  return Object.fromEntries(
    [...snapshot.goalCandidates, ...snapshot.memoryCandidates].map(
      (candidate) => [candidate.id, defaultReviewSelection(candidate)],
    ),
  );
}

function reconcileReviewSelections(
  snapshot: OnboardingSnapshot,
  current: ReviewSelections,
): ReviewSelections {
  const candidates = [...snapshot.goalCandidates, ...snapshot.memoryCandidates];
  const next = Object.fromEntries(
    candidates.map((candidate) => {
      const previous = current[candidate.id];
      const fallback = defaultReviewSelection(candidate);
      return [
        candidate.id,
        previous
          ? {
              decision: previous.decision,
              resolution: allowedResolution(candidate, previous.resolution)
                ? previous.resolution
                : fallback.resolution,
            }
          : fallback,
      ];
    }),
  );
  if (
    Object.keys(next).length === Object.keys(current).length &&
    Object.entries(next).every(
      ([id, selection]) =>
        current[id]?.decision === selection.decision &&
        current[id]?.resolution === selection.resolution,
    )
  ) {
    return current;
  }
  return next;
}

function defaultReviewSelection(
  candidate:
    | OnboardingSnapshot["goalCandidates"][number]
    | OnboardingSnapshot["memoryCandidates"][number],
): ReviewSelection {
  return {
    // What the owner typed is theirs to keep unless they say otherwise, so
    // an undecided card starts accepted (owner, 2 Oct 2026). It is stated,
    // not inferred, and nothing is filed before "Save accepted items".
    decision:
      candidate.decision === "pending" ? "accepted" : candidate.decision,
    resolution:
      candidate.resolution ??
      (candidate.comparison.kind === "new"
        ? "create"
        : candidate.comparison.kind === "exact"
          ? "keep"
          : "update"),
  };
}

function allowedResolution(
  candidate:
    | OnboardingSnapshot["goalCandidates"][number]
    | OnboardingSnapshot["memoryCandidates"][number],
  resolution: OnboardingResolution,
) {
  if (candidate.comparison.kind === "new") return resolution === "create";
  if (candidate.comparison.kind === "exact") return resolution === "keep";
  if (
    candidate.comparison.existingStatus &&
    candidate.comparison.existingStatus !== "active"
  ) {
    return resolution === "update";
  }
  return resolution === "keep" || resolution === "update";
}

export function isActionErrorStatus(
  status: OnboardingActionState["status"],
): boolean {
  return (
    status === "validation" ||
    status === "conflict" ||
    status === "session" ||
    status === "error"
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A time zone is chosen, not typed (owner, 2 Oct 2026). The list is the
 * browser's own and is read on the client only: the server renders the one
 * option it knows, the client agrees on its first render, and hydration
 * cannot mismatch. With nothing saved yet it starts on the browser's zone.
 */
function TimezoneSelect({ saved }: { saved: string | null }) {
  const zones = useSyncExternalStore(subscribeNothing, readZones, noZones);
  const detected = useSyncExternalStore(
    subscribeNothing,
    readBrowserZone,
    () => null,
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const value = chosen ?? saved ?? detected ?? "UTC";
  // The browser's list need not hold the saved zone, and Chrome's leaves
  // out UTC, which is what a draft with no zone starts from.
  const options = [...new Set(["UTC", value, ...zones])].toSorted();
  return (
    <select
      name="timezoneName"
      onChange={(event) => setChosen(event.target.value)}
      required
      value={value}
    >
      {options.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

function subscribeNothing() {
  return () => {};
}

const NO_ZONES: readonly string[] = [];

function noZones() {
  return NO_ZONES;
}

let knownZones: readonly string[] | null = null;

/** Cached, because a store's snapshot must be the same array every time. */
function readZones(): readonly string[] {
  if (knownZones === null) {
    try {
      knownZones = Intl.supportedValuesOf("timeZone");
    } catch {
      knownZones = NO_ZONES;
    }
  }
  return knownZones;
}

function readBrowserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function stripConstraintPrefix(content: string, label: string) {
  if (content === `${label}.`) return "";
  return content.startsWith(`${label}: `)
    ? content.slice(label.length + 2)
    : content;
}
