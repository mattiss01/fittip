"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  changeOnboardingAction,
  leaveSetupAction,
} from "@/app/home/you/onboarding/actions";
import {
  INITIAL_ONBOARDING_ACTION_STATE,
  type OnboardingActionState,
} from "@/app/home/you/onboarding/action-state";
import styles from "@/app/home/you/onboarding/onboarding.module.css";
import { adoptBrowserTimezoneAction } from "@/app/home/you/profile-actions";
import {
  ABOUT_YOU_QUESTIONS,
  AboutYouForm,
  ContinueLater,
  SportsForm,
} from "@/components/profile/profile-forms";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";
import {
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

/**
 * Setup's steps (owner, 5 Oct 2026). The profile's own come first and are
 * saved straight to it: "About you", asked one question at a time, then
 * "Your sports". The draft's six follow, which it still counts from one.
 */
type ProfileStep = 1 | 2;
const SPORTS_HEADING = "Your sports";
const STEPS_BEFORE_DRAFT = ABOUT_YOU_QUESTIONS.length + 1;
const STEP_COUNT = STEPS_BEFORE_DRAFT + ONBOARDING_STEPS.length;

/**
 * The time zone and the units are the profile's, chosen in "About you". The
 * draft still writes a memory statement for each when "Time and access" is
 * saved; those two are never shown for review and never filed.
 */
function isProfileOwned(candidate: { fieldKey: string }) {
  return (
    candidate.fieldKey === "context:timezone" ||
    candidate.fieldKey === "context:units"
  );
}

/**
 * Where setup opens. The draft remembers its own step, but nothing records
 * how far the profile's steps got, so that is read from what they saved:
 * the first "About you" question still unanswered, then "Your sports" while
 * none is chosen. Only while the draft's own steps are untouched; once one
 * of those is saved the owner is past the profile's, and setup opens where
 * the draft is. An optional question left empty on purpose is asked again,
 * which costs one press of Next.
 */
function resumeAt(
  profile: ProfileDetailsView,
  draft: OnboardingSnapshot["draft"],
): { profileStep: ProfileStep | null; aboutQuestion: number } {
  if (!profile.displayName) return { profileStep: 1, aboutQuestion: 0 };
  if (draft && draft.revision > 0) {
    return { profileStep: null, aboutQuestion: 0 };
  }
  const answered = [
    profile.displayName,
    profile.birthDate,
    profile.gender,
    profile.heightCm,
    profile.latestWeightKg,
  ];
  const unanswered = answered.findIndex((answer) => answer === null);
  if (unanswered >= 0) return { profileStep: 1, aboutQuestion: unanswered };
  return {
    profileStep: profile.sports.length === 0 ? 2 : null,
    aboutQuestion: 0,
  };
}

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
  profile,
  reminder = false,
}: {
  snapshot: OnboardingSnapshot;
  profile: ProfileDetailsView;
  /**
   * The owner chose "Continue later" before and has just signed in: setup
   * does not open by itself again, it asks first.
   */
  reminder?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changeOnboardingAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );
  const [selectedStep, setVisibleStep] = useState<OnboardingStep | null>(null);
  // Only the name is required, and it is asked first: until it is saved,
  // setup opens on "About you", and the only way on is to save it.
  const [profileStep, setProfileStep] = useState<ProfileStep | null>(
    () => resumeAt(profile, snapshot.draft).profileStep,
  );
  const [aboutQuestion, setAboutQuestion] = useState(
    () => resumeAt(profile, snapshot.draft).aboutQuestion,
  );
  // "Continue later" is setup's one way out besides finishing (owner, 5 Oct
  // 2026): it saves what the step holds and goes to the app. There is no
  // "Cancel and delete draft" any more; an untouched draft expires by itself.
  // It also records that the owner left, which is what makes the next
  // sign-in ask about setup instead of opening it.
  const [, startLeaving] = useTransition();
  const continueLater = () => startLeaving(() => leaveSetupAction());
  const [reminding, setReminding] = useState(reminder);
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
  }, [snapshot.draft, visibleStep, profileStep, aboutQuestion, state.status]);

  // The profile's time zone is the browser's until the owner changes it,
  // and it is stored as setup opens: see `adoptBrowserTimezoneAction`.
  const needsZone = profile.timezoneName === null && snapshot.draft !== null;
  const zoneSent = useRef(false);
  useEffect(() => {
    if (!needsZone || zoneSent.current) return;
    let zone: string | undefined;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    zoneSent.current = true;
    void adoptBrowserTimezoneAction(zone);
  }, [needsZone]);

  // Done once, setup is not offered again (owner, 2 Oct 2026): everything it
  // filed can be changed where it lives. A draft begun before that rule is
  // still shown below, so it can be finished or cancelled.
  if (!snapshot.draft && snapshot.hasPublished) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-done">
        <p className={styles.eyebrow}>Setup done</p>
        <h2 id="setup-done">Your setup is finished</h2>
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
        <h2 id="setup-start">Set up your coaching context</h2>
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

  // Signed in again after "Continue later" (owner, 5 Oct 2026): one page
  // saying setup is not finished, with one button to go on and one to skip.
  if (reminding) {
    return (
      <section
        className={`${styles.startCard} ${styles.reminder}`}
        aria-labelledby="setup-reminder"
      >
        <h2 id="setup-reminder">Your setup is not finished</h2>
        <p>
          Your coach and your plan work from what you tell us in setup. It takes
          a few minutes, and what you already answered is kept.
        </p>
        <button onClick={() => setReminding(false)} type="button">
          Continue setup
        </button>
        <Link className={styles.quietLink} href="/home/today">
          Skip for now
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
  const draftStep = profileStep === null ? visibleStep : null;
  // Where setup stands among all its steps, each question of "About you"
  // counted as one, and the heading that step is shown under.
  const position =
    profileStep === 1
      ? aboutQuestion + 1
      : profileStep === 2
        ? STEPS_BEFORE_DRAFT
        : STEPS_BEFORE_DRAFT + visibleStep;
  const heading =
    profileStep === 1
      ? ABOUT_YOU_QUESTIONS[aboutQuestion]
      : profileStep === 2
        ? SPORTS_HEADING
        : ONBOARDING_STEPS[visibleStep - 1];
  // Back is one arrow at the top of the page, not a button on every step
  // (owner, 5 Oct 2026). The first question has nowhere to go back to.
  const goBack =
    position === 1
      ? null
      : () => {
          if (profileStep === 1) setAboutQuestion(aboutQuestion - 1);
          else if (profileStep === 2) {
            setAboutQuestion(ABOUT_YOU_QUESTIONS.length - 1);
            setProfileStep(1);
          } else if (visibleStep === 1) setProfileStep(2);
          else setVisibleStep((visibleStep - 1) as OnboardingStep);
        };
  // The steps before this one: nothing is done on the first.
  const percentDone = Math.round(((position - 1) / STEP_COUNT) * 100);
  const reviewedMemory = snapshot.memoryCandidates.filter(
    (candidate) => !isProfileOwned(candidate),
  );
  const coreGoalCount = rankPreview.filter(
    (goal) => goal.tier === "core",
  ).length;

  return (
    <div className={styles.manager}>
      {/* One bar and how much is done, not a row of eight steps, and the
          step's own name as its heading with no second line under it (owner,
          5 Oct 2026). A step is left by the arrow above it. */}
      {goBack ? (
        <button
          aria-label="Back"
          className={styles.backArrow}
          onClick={goBack}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="22"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            width="22"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      ) : null}
      <div className={styles.progress}>
        <div
          aria-label="Guided setup progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percentDone}
          aria-valuetext={`Step ${position} of ${STEP_COUNT}, ${percentDone}% done`}
          className={styles.progressTrack}
          role="progressbar"
        >
          <span style={{ width: `${percentDone}%` }} />
        </div>
        <p aria-hidden="true">{percentDone}%</p>
      </div>

      <OnboardingActionNotice state={state} />

      {/* The step itself sits in the middle of what is left of the screen
          under the bar (owner, 5 Oct 2026); a step taller than that starts
          right under the bar as before. */}
      <div className={styles.stepBody}>
        <header className={styles.stepHeader}>
          <h2 ref={headingRef} tabIndex={-1}>
            {heading}
          </h2>
        </header>

        {profileStep === 1 ? (
          <AboutYouForm
            onLater={continueLater}
            onQuestion={setAboutQuestion}
            onSaved={() => setProfileStep(2)}
            profile={profile}
            question={aboutQuestion}
            submitLabel="Save and continue"
          />
        ) : null}

        {profileStep === 2 ? (
          <SportsForm
            onLater={continueLater}
            onSaved={() => setProfileStep(null)}
            sports={profile.sports}
            submitLabel="Save and continue"
          />
        ) : null}

        {draftStep === 1 ? (
          <form action={formAction} className={styles.stepForm}>
            <StepMeta
              operation="save_goals"
              revision={draft.revision}
              step={1}
            />
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
            <StepActions pending={pending} />
          </form>
        ) : null}

        {draftStep === 2 ? (
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
            <StepActions pending={pending} />
          </form>
        ) : null}

        {draftStep === 3 ? (
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
            {/* Chosen in "About you" and kept in the profile. The draft still
              asks for both, so they are sent from there, unseen. */}
            <input
              name="timezoneName"
              type="hidden"
              value={profile.timezoneName ?? draft.timezoneName ?? "UTC"}
            />
            <input
              name="units"
              type="hidden"
              value={profile.unitsSystem ?? draft.units ?? "metric"}
            />
            <StepActions pending={pending} />
          </form>
        ) : null}

        {draftStep === 4 ? (
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
                Optional. One memory statement per line, up to 10 lines and
                1,000 characters each.
              </small>
            </label>
            <StepActions pending={pending} />
          </form>
        ) : null}

        {draftStep === 5 ? (
          <form action={formAction} className={styles.stepForm}>
            <StepMeta
              operation="save_constraints"
              revision={draft.revision}
              step={5}
            />
            <aside className={styles.privacyNotice}>
              Constraints are optional, health-adjacent account data. They stay
              in your draft until you accept them, and are not sent to an AI
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
            <StepActions pending={pending} />
          </form>
        ) : null}

        {draftStep === 6 ? (
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
              A card you have not decided starts accepted. Reject what you do
              not want kept. Rejected cards stay only in this draft and are
              deleted when you save.
            </p>
            <section
              className={styles.contextMap}
              aria-labelledby="context-map"
            >
              <header>
                <p>Context map</p>
                <h3 id="context-map">Choose where each statement lands</h3>
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
              {snapshot.memoryCandidates
                .filter(isProfileOwned)
                .map((candidate) => (
                  <span hidden key={candidate.id}>
                    <input
                      name="candidateId"
                      type="hidden"
                      value={candidate.id}
                    />
                    <input
                      name={`kind:${candidate.id}`}
                      type="hidden"
                      value="memory"
                    />
                    <input
                      name={`decision:${candidate.id}`}
                      type="hidden"
                      value="rejected"
                    />
                  </span>
                ))}
              {reviewedMemory.map((candidate) => (
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
                    These choices would create {coreGoalCount} core goals.
                    Reduce the result to at most three before publication.
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
      </div>
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

function StepActions({ pending }: { pending: boolean }) {
  return (
    <div className={styles.stepActions}>
      {/* Leaving must not wait on a field: the browser's own check is off
          for this button, and the action leaves even when the step is not
          complete enough to save. */}
      <ContinueLater>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          formNoValidate
          name="intent"
          value="finish"
        >
          Continue later
        </button>
      </ContinueLater>
      <button disabled={pending} name="intent" value="continue">
        Save and continue
      </button>
    </div>
  );
}

/**
 * The same four questions and the same choice as a goal on Goals (owner,
 * 5 Oct 2026). The draft still stores the rest of a goal, so the fields that
 * are no longer asked are sent empty, the kind as "other" and today as the
 * start. No rank is sent, so a goal is filed last among its own kind: a rank
 * counted over all three goals was refused when they were not all core.
 */
function GoalFields({
  candidate,
  index,
}: {
  candidate?: GoalCandidateView;
  index: number;
}) {
  // The owner's own day once the browser is there to ask; the server, which
  // does not know their zone yet, renders the UTC one.
  const startDate = useSyncExternalStore(subscribeNothing, localToday, today);
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
          className={styles.growing}
          defaultValue={candidate?.desiredOutcome ?? ""}
          maxLength={1000}
          name={`goalOutcome:${index}`}
          onInput={(event) => fitToText(event.currentTarget)}
          ref={fitToText}
          required={index === 0}
          rows={1}
        />
      </label>
      <label>
        Sports
        <input
          defaultValue={candidate?.activityAreas.join(", ") ?? ""}
          name={`goalActivities:${index}`}
          placeholder="Running, strength"
          required={index === 0}
        />
      </label>
      <label>
        Target date (optional)
        <input
          defaultValue={candidate?.targetDate ?? ""}
          name={`goalTargetDate:${index}`}
          type="date"
        />
      </label>
      {/* Two choices side by side, as on Goals, not a list to open. */}
      <fieldset className={styles.attentionChoice}>
        <legend>Attention</legend>
        {(["core", "supporting"] as const).map((tier) => (
          <label key={tier}>
            <input
              defaultChecked={(candidate?.priorityTier ?? "core") === tier}
              name={`goalTier:${index}`}
              type="radio"
              value={tier}
            />
            {tier === "core" ? "Core" : "Supporting"}
          </label>
        ))}
      </fieldset>
      <input
        name={`goalCategory:${index}`}
        type="hidden"
        value={candidate?.category ?? "other"}
      />
      <input
        name={`goalStartDate:${index}`}
        type="hidden"
        value={candidate?.startDate ?? startDate}
      />
      <input
        name={`goalRank:${index}`}
        type="hidden"
        value={candidate?.targetRank ?? ""}
      />
      {(
        [
          ["goalTargetDetail", candidate?.targetDetail],
          ["goalMetricLabel", candidate?.targetMetricLabel],
          ["goalMetricValue", candidate?.targetMetricValue],
          ["goalMetricUnit", candidate?.targetMetricUnit],
          ["goalRationale", candidate?.rationale],
          ["goalConstraints", candidate?.constraints],
        ] as const
      ).map(([name, value]) => (
        <input
          key={name}
          name={`${name}:${index}`}
          type="hidden"
          value={value ?? ""}
        />
      ))}
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

/**
 * As tall as what is in it: one line when empty, like the title above it,
 * and a line more for each line typed (owner, 5 Oct 2026).
 */
function fitToText(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function subscribeNothing() {
  return () => {};
}

function stripConstraintPrefix(content: string, label: string) {
  if (content === `${label}.`) return "";
  return content.startsWith(`${label}: `)
    ? content.slice(label.length + 2)
    : content;
}
