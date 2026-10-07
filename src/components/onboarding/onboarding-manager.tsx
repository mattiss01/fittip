"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";

import {
  finishSetupAction,
  leaveSetupAction,
  recordSetupStepAction,
  saveSetupGoalsAction,
  startSetupAction,
} from "@/app/home/you/onboarding/actions";
import {
  INITIAL_SETUP_ACTION_STATE,
  type SetupActionState,
} from "@/app/home/you/onboarding/action-state";
import styles from "@/app/home/you/onboarding/onboarding.module.css";
import { adoptBrowserTimezoneAction } from "@/app/home/you/profile-actions";
import { DateField } from "@/components/date-field/date-field";
import {
  ABOUT_YOU_QUESTIONS,
  AboutYouForm,
  ContinueLater,
  SportsForm,
} from "@/components/profile/profile-forms";
import {
  TRAINING_QUESTIONS,
  TrainingQuestionForm,
} from "@/components/profile/training-forms";
import type { ProfileDetailsView } from "@/lib/profile/profile-contract";
import {
  SETUP_NOTE_MAX_LENGTH,
  SETUP_NOTE_PROMPTS,
  SETUP_NOTES_MAX_COUNT,
  SETUP_STEP_COUNT,
  SETUP_STEPS,
  setupStepNumber,
  type SetupGoalView,
  type SetupNotePromptKey,
  type SetupStep,
} from "@/lib/setup/setup-steps";
import { trainsAtHome } from "@/lib/training/training-setup";

/**
 * Guided setup (owner, 5 and 6 Oct 2026): twelve short screens, each saved
 * where its answer lives as Next is pressed. "About you", the sports and the
 * training setup go to the profile, goals to Goals, and what the owner writes
 * on the last screen to Memory. Nothing waits in a draft and nothing is
 * reviewed at the end.
 */
const HEADINGS: Record<SetupStep, { heading: string; caption?: string }> = {
  name: { heading: ABOUT_YOU_QUESTIONS[0] },
  birthday: { heading: ABOUT_YOU_QUESTIONS[1] },
  gender: { heading: ABOUT_YOU_QUESTIONS[2] },
  height: { heading: ABOUT_YOU_QUESTIONS[3] },
  weight: { heading: ABOUT_YOU_QUESTIONS[4] },
  // A line under the heading where the heading alone does not say what to
  // do (owner, 5 Oct 2026).
  sports: {
    heading: "Your sports",
    caption: "Select the sports you do or are interested in",
  },
  goals: { heading: "Goals", caption: "What you want to train for" },
  frequency: TRAINING_QUESTIONS.frequency,
  days: TRAINING_QUESTIONS.days,
  places: TRAINING_QUESTIONS.places,
  equipment: TRAINING_QUESTIONS.equipment,
  notes: {
    heading: "Anything your coach should know?",
    caption:
      "The more your coach knows, the better your plan fits. A few words are enough",
  },
};

const FIRST = setupStepNumber("name");
const SPORTS = setupStepNumber("sports");
const GOALS = setupStepNumber("goals");
const EQUIPMENT = setupStepNumber("equipment");

export function SetupActionNotice({ state }: { state: SetupActionState }) {
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.submission > 0 && isActionErrorStatus(state.status)) {
      noticeRef.current?.focus();
    }
  }, [state.status, state.submission]);

  // A save that went through says nothing: the next screen is the answer.
  if (!isActionErrorStatus(state.status) || state.message === "") return null;

  return (
    <div
      className={styles.notice}
      data-setup-notice
      data-state={state.status}
      ref={noticeRef}
      role="alert"
      tabIndex={-1}
    >
      {state.message}
    </div>
  );
}

export function OnboardingManager({
  profile,
  goals,
  reminder = false,
}: {
  profile: ProfileDetailsView;
  /** The goals the account has, to go on from instead of typing them again. */
  goals: SetupGoalView[];
  /**
   * The owner chose "Continue later" before and has just signed in: setup
   * does not open by itself again, it asks first.
   */
  reminder?: boolean;
}) {
  // Setup reopens on the screen the owner was on, which the profile stores.
  // Only the name is required, and it is asked first: until it is saved,
  // setup opens there whatever is stored.
  const [step, setStep] = useState(() =>
    profile.displayName
      ? Math.min(SETUP_STEP_COUNT, Math.max(FIRST, profile.setup.step ?? FIRST))
      : FIRST,
  );
  const [, startRecording] = useTransition();
  const go = (next: number) => {
    setStep(next);
    startRecording(() => recordSetupStepAction(next));
  };
  // "Continue later" is setup's one way out besides finishing (owner, 5 Oct
  // 2026): it saves what the screen holds and goes to the app. It also
  // records that the owner left, which is what makes the next sign-in ask
  // about setup instead of opening it.
  const [, startLeaving] = useTransition();
  const [reminding, setReminding] = useState(reminder);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const begun = profile.setup.step !== null && !profile.setup.finished;

  // "What do you have at home?" is only asked of someone who trains there.
  // Worked out as the screen is drawn rather than when Next is pressed, so it
  // follows the places as they are saved.
  const atHome = trainsAtHome(profile.training.trainingPlaces);
  const shown = step === EQUIPMENT && !atHome ? EQUIPMENT + 1 : step;
  const current = SETUP_STEPS[shown - 1];

  useEffect(() => {
    if (begun && !reminding) headingRef.current?.focus();
  }, [begun, reminding, shown]);

  // The profile's time zone is the browser's until the owner changes it,
  // and it is stored as setup opens: see `adoptBrowserTimezoneAction`.
  const needsZone = profile.timezoneName === null && begun;
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
  // saved can be changed where it lives.
  if (profile.setup.finished) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-done">
        <p className={styles.eyebrow}>Setup done</p>
        <h2 id="setup-done">Your setup is finished</h2>
        <p>
          What you told us is in Goals, Memory and Settings. Change anything
          there.
        </p>
        <div className={styles.resultActions}>
          <Link href="/home/you/goals">Goals</Link>
          <Link href="/home/you/memory">Memory</Link>
          <Link href="/home/you/settings">Settings</Link>
        </div>
      </section>
    );
  }

  // An account from before setup began by itself, reaching it from You.
  if (!begun) {
    return (
      <section className={styles.startCard} aria-labelledby="setup-start">
        <p className={styles.eyebrow}>Optional setup</p>
        <h2 id="setup-start">Set up your coaching context</h2>
        <p>
          A few short questions about you, your goals and how you can train.
          Each answer is saved as you go, and setup never blocks planning or
          logging.
        </p>
        <form action={startSetupAction}>
          <button>Start setup</button>
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

  const continueLater = () => startLeaving(() => leaveSetupAction(shown));
  const next = () => go(shown + 1);
  // Back is one arrow at the top of the page, not a button on every screen
  // (owner, 5 Oct 2026). The first question has nowhere to go back to.
  const goBack =
    shown === FIRST
      ? null
      : () =>
          setStep(shown - 1 === EQUIPMENT && !atHome ? shown - 2 : shown - 1);
  // The screens before this one: nothing is done on the first.
  const percentDone = Math.round(((shown - 1) / SETUP_STEP_COUNT) * 100);
  const { heading, caption } = HEADINGS[current];

  return (
    <div className={styles.manager}>
      {/* One bar and how much is done, not a row of steps, and the screen's
          own name as its heading with no second line under it (owner, 5 Oct
          2026). A screen is left by the arrow above it. */}
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
          aria-valuetext={`Step ${shown} of ${SETUP_STEP_COUNT}, ${percentDone}% done`}
          className={styles.progressTrack}
          role="progressbar"
        >
          <span style={{ width: `${percentDone}%` }} />
        </div>
        <p aria-hidden="true">{percentDone}%</p>
      </div>

      {/* The screen itself sits in the middle of what is left under the bar
          (owner, 5 Oct 2026); one taller than that starts right under it. */}
      <div className={styles.stepBody}>
        <header className={styles.stepHeader}>
          <h2 ref={headingRef} tabIndex={-1}>
            {heading}
          </h2>
          {caption ? <span>{caption}</span> : null}
        </header>

        {shown < SPORTS ? (
          <AboutYouForm
            onLater={continueLater}
            onQuestion={(question) => go(question + 1)}
            onSaved={() => go(SPORTS)}
            profile={profile}
            question={shown - 1}
            submitLabel="Next"
          />
        ) : null}

        {current === "sports" ? (
          <SportsForm
            onLater={continueLater}
            onSaved={next}
            sports={profile.sports}
            submitLabel="Next"
          />
        ) : null}

        {current === "goals" ? (
          <GoalsStep goals={goals} onSaved={next} sports={profile.sports} />
        ) : null}

        {current === "frequency" ||
        current === "days" ||
        current === "places" ||
        current === "equipment" ? (
          <TrainingQuestionForm
            // A form of its own for each question, so one's state is never
            // another's.
            key={current}
            onLater={continueLater}
            onSaved={next}
            question={current}
            submitLabel="Next"
            training={profile.training}
          />
        ) : null}

        {current === "notes" ? <NotesStep /> : null}
      </div>
    </div>
  );
}

type GoalRow = { key: number; id: string | null; goal?: SetupGoalView };

/**
 * The goals screen: the same four questions and the same choice as a goal on
 * Goals (owner, 5 Oct 2026), and saved as goals when Next is pressed. It
 * starts from the goals the account already has, so goals made before setup
 * are edited here rather than typed again.
 */
function GoalsStep({
  goals,
  sports,
  onSaved,
}: {
  goals: SetupGoalView[];
  sports: string[];
  onSaved: () => void;
}) {
  const [state, action] = useActionState(
    saveSetupGoalsAction,
    INITIAL_SETUP_ACTION_STATE,
  );
  // The rows are this screen's own once it is open. The goals are read again
  // after every save, in Goals' order, and following that would put what is
  // typed in one row under another's goal.
  const [rows, setRows] = useState<GoalRow[]>(() =>
    goals.length
      ? goals.map((goal, key) => ({ key, id: goal.id, goal }))
      : [{ key: 0, id: null }],
  );
  const nextKey = useRef(rows.length);
  // Sent by hand rather than as the form's own action: React empties a
  // form's fields once its action has run, and a goal refused for one field
  // would lose the others.
  const [pending, startSending] = useTransition();
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const answers = new FormData(event.currentTarget, submitter);
    startSending(() => action(answers));
  };

  // A saved screen moves on. One saved in part keeps the ids of the rows
  // that went through, so pressing Next again edits them and does not make
  // them a second time.
  const [settled, setSettled] = useState(0);
  if (state.submission !== settled) {
    setSettled(state.submission);
    const ids = state.goalIds ?? [];
    if (ids.some((id) => id !== null)) {
      setRows((current) =>
        current.map((row, index) => ({ ...row, id: ids[index] ?? row.id })),
      );
    }
  }
  const handled = useRef(0);
  useEffect(() => {
    if (handled.current === state.submission) return;
    handled.current = state.submission;
    if (state.status === "saved") onSaved();
  });

  return (
    <form className={styles.stepForm} data-goals onSubmit={send}>
      <SetupActionNotice state={state} />
      <input name="goalCount" type="hidden" value={rows.length} />
      <input name="setupStep" type="hidden" value={GOALS} />
      {rows.map((row, index) => (
        <GoalFields
          goal={row.goal}
          id={row.id}
          index={index}
          key={row.key}
          // A goal added here and not saved yet can be taken away again;
          // a saved one is changed or removed on Goals.
          onRemove={
            row.id === null && rows.length > 1 && !pending
              ? () =>
                  setRows((current) =>
                    current.filter((other) => other.key !== row.key),
                  )
              : undefined
          }
          sports={sports}
        />
      ))}
      <button
        className={styles.addEntry}
        // Not while a save is on its way: its answer names the rows by
        // their place, which adding or removing one would shift.
        disabled={pending}
        onClick={() => {
          const key = nextKey.current;
          nextKey.current += 1;
          setRows((current) => [...current, { key, id: null }]);
        }}
        type="button"
      >
        Add another goal
      </button>
      <StepActions pending={pending} />
    </form>
  );
}

function StepActions({
  pending,
  submitLabel = "Next",
}: {
  pending: boolean;
  submitLabel?: string;
}) {
  return (
    <div className={styles.stepActions}>
      {/* Leaving must not wait on a field: the browser's own check is off
          for this button, and the action leaves even when the screen is not
          complete enough to save. */}
      <ContinueLater>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          formNoValidate
          name="intent"
          value="later"
        >
          Continue later
        </button>
      </ContinueLater>
      <button disabled={pending} name="intent" value="continue">
        {submitLabel}
      </button>
    </div>
  );
}

function GoalFields({
  goal,
  id,
  index,
  sports,
  onRemove,
}: {
  goal?: SetupGoalView;
  /** The saved goal this row is, or null for one not saved yet. */
  id: string | null;
  index: number;
  /** The sports chosen in "Your sports", offered for the goal to pick from. */
  sports: string[];
  onRemove?: () => void;
}) {
  // A goal with a title is one that will be saved, and so must name a sport.
  const [titled, setTitled] = useState(Boolean(goal?.title));
  return (
    <fieldset className={styles.entryCard}>
      <legend>Goal {index + 1}</legend>
      <input name={`goalId:${index}`} type="hidden" value={id ?? ""} />
      <label>
        Goal title
        <input
          defaultValue={goal?.title ?? ""}
          maxLength={120}
          name={`goalTitle:${index}`}
          onChange={(event) => setTitled(event.target.value.trim() !== "")}
          required={index === 0}
        />
      </label>
      <label>
        Desired outcome
        <textarea
          className={styles.growing}
          defaultValue={goal?.desiredOutcome ?? ""}
          maxLength={1000}
          name={`goalOutcome:${index}`}
          onInput={(event) => fitToText(event.currentTarget)}
          ref={fitToText}
          required={index === 0 || titled}
          rows={1}
        />
      </label>
      <GoalSport
        index={index}
        initial={goal?.sports ?? []}
        required={index === 0 || titled}
        sports={sports}
      />
      <DateField
        calendar
        initial={goal?.targetDate ?? null}
        label="Target date (optional)"
        name={`goalTargetDate:${index}`}
      />
      {/* Two choices side by side, as on Goals, not a list to open. A group
          with a plain label over it: inside this card a fieldset's legend
          is drawn as a card title, and took a place beside "Core". */}
      <div
        aria-labelledby={`goal-attention-${index}`}
        className={styles.fieldGroup}
        role="radiogroup"
      >
        <span className={styles.fieldLabel} id={`goal-attention-${index}`}>
          Attention
        </span>
        <div className={styles.attentionOptions}>
          {(["core", "supporting"] as const).map((tier) => (
            <label key={tier}>
              <input
                defaultChecked={(goal?.priorityTier ?? "core") === tier}
                name={`goalTier:${index}`}
                type="radio"
                value={tier}
              />
              {tier === "core" ? "Core" : "Supporting"}
            </label>
          ))}
        </div>
      </div>
      {onRemove ? (
        <button className={styles.removeEntry} onClick={onRemove} type="button">
          Remove this goal
        </button>
      ) : null}
    </fieldset>
  );
}

type NoteField = { key: number; kind: SetupNotePromptKey; text: string };

/**
 * Setup's last screen (owner, 6 Oct 2026). A bare text field is skipped
 * before it is thought about, so the screen offers what to write about: a tap
 * on a prompt adds a field under that label, and any prompt can be tapped
 * again for another. Each field is filed in Memory as one item, as written.
 */
function NotesStep() {
  const [state, action, pending] = useActionState(
    finishSetupAction,
    INITIAL_SETUP_ACTION_STATE,
  );
  const [fields, setFields] = useState<NoteField[]>([]);
  const nextKey = useRef(0);
  const added = useRef<HTMLTextAreaElement | null>(null);
  const justAdded = useRef(false);
  const full = fields.length >= SETUP_NOTES_MAX_COUNT;

  // The field a tap just added is the one to write in.
  useEffect(() => {
    if (justAdded.current) added.current?.focus();
    justAdded.current = false;
  }, [fields.length]);

  return (
    <form action={action} className={styles.stepForm} data-notes>
      <SetupActionNotice state={state} />
      <input name="setupStep" type="hidden" value={setupStepNumber("notes")} />
      <div className={styles.prompts}>
        {SETUP_NOTE_PROMPTS.map((prompt) => (
          <button
            disabled={full}
            key={prompt.key}
            onClick={() => {
              const key = nextKey.current;
              nextKey.current += 1;
              justAdded.current = true;
              setFields((current) => [
                ...current,
                { key, kind: prompt.key, text: "" },
              ]);
            }}
            type="button"
          >
            {prompt.label}
          </button>
        ))}
      </div>
      {fields.map((field, index) => {
        const label = SETUP_NOTE_PROMPTS.find(
          (prompt) => prompt.key === field.kind,
        )!.label;
        return (
          <div className={styles.noteField} key={field.key}>
            <input name="noteKind" type="hidden" value={field.kind} />
            <label>
              {label}
              <textarea
                className={styles.growing}
                maxLength={SETUP_NOTE_MAX_LENGTH}
                name="noteText"
                onChange={(event) => {
                  const text = event.target.value;
                  setFields((current) =>
                    current.map((other) =>
                      other.key === field.key ? { ...other, text } : other,
                    ),
                  );
                }}
                onInput={(event) => fitToText(event.currentTarget)}
                ref={(element) => {
                  fitToText(element);
                  if (element && index === fields.length - 1) {
                    added.current = element;
                  }
                }}
                rows={1}
                value={field.text}
              />
            </label>
            <button
              aria-label={`Remove: ${label}`}
              className={styles.removeEntry}
              onClick={() =>
                setFields((current) =>
                  current.filter((other) => other.key !== field.key),
                )
              }
              type="button"
            >
              Remove
            </button>
          </div>
        );
      })}
      <p className={styles.safetyCopy}>
        Your coach reads what you write here, and you can change it in Memory.
        FitTip cannot assess or diagnose symptoms: if something is severe,
        sudden or getting worse, see a health professional.
      </p>
      <StepActions pending={pending} submitLabel="Finish setup" />
    </form>
  );
}

export function isActionErrorStatus(
  status: SetupActionState["status"],
): boolean {
  return (
    status === "validation" ||
    status === "conflict" ||
    status === "session" ||
    status === "error"
  );
}

/** A select value no sport can have: a name is never a lone control mark. */
const ANOTHER_SPORT = "\u0000another";

/**
 * A goal's sport (owner, 5 Oct 2026): exactly one, chosen from a list of the
 * sports picked in "Your sports", or made up on the spot. A made-up one is
 * sent as the goal's sport like any other, and the step's save adds it to
 * the owner's sports. Nothing is chosen to begin with, so a goal is never
 * filed under a sport the owner did not pick.
 */
function GoalSport({
  index,
  initial,
  sports,
  required,
}: {
  index: number;
  required: boolean;
  /** What the goal names already; a goal made before today may name several. */
  initial: string[];
  sports: string[];
}) {
  const known = (name: string) =>
    sports.find(
      (sport) => sport.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
  const first = initial[0] ?? null;
  // A sport the goal already holds that is not among the owner's is still
  // offered, rather than silently dropped from the goal.
  const options =
    first !== null && known(first) === undefined ? [...sports, first] : sports;
  const start = first === null ? "" : (known(first) ?? first);
  const [choice, setChoice] = useState(start);
  const [made, setMade] = useState("");
  const [open, setOpen] = useState(false);
  const adding = choice === ANOTHER_SPORT;
  const labelId = `goal-sport-${index}`;
  const button = useRef<HTMLButtonElement>(null);
  // The list goes away with the choice, so focus goes back to the button
  // that opened it instead of being left on nothing.
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (value: string) => {
    setChoice(value);
    close();
  };
  // Left on the sport it came with, a goal keeps every sport it named; only
  // a different choice makes it that one alone.
  const sent = adding
    ? made.trim()
    : choice === start && initial.length > 1
      ? initial.join(", ")
      : choice;

  // A list of our own, opened under its button, in place of the browser's
  // drop-down, whose opened list cannot be styled (owner, 5 Oct 2026).
  return (
    <div
      className={styles.fieldGroup}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <span className={styles.fieldLabel} id={labelId}>
        Sport
      </span>
      <button
        ref={button}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${labelId}-value`}
        className={styles.picker}
        data-empty={choice === "" ? "true" : undefined}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span id={`${labelId}-value`}>
          {adding ? "Another sport" : choice || "Choose a sport"}
        </span>
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
          width="18"
        >
          <path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>
      {open ? (
        <div
          aria-labelledby={labelId}
          className={styles.pickerOptions}
          role="listbox"
        >
          {options.map((sport) => (
            <button
              aria-selected={choice === sport}
              key={sport}
              onClick={() => pick(sport)}
              role="option"
              type="button"
            >
              {sport}
            </button>
          ))}
          <button
            aria-selected={adding}
            onClick={() => pick(ANOTHER_SPORT)}
            role="option"
            type="button"
          >
            Add another sport…
          </button>
        </div>
      ) : null}
      {adding ? (
        <label>
          New sport
          <input
            maxLength={60}
            onChange={(event) => setMade(event.target.value)}
            // A comma separates sports where they are stored as a list.
            pattern="[^,]+"
            required
            value={made}
          />
        </label>
      ) : null}
      <input name={`goalActivities:${index}`} type="hidden" value={sent} />
      {/* A goal that will be saved must name a sport, and a hidden field cannot be
          required, so this one stands in for it: out of sight, but where the
          browser can point at it when nothing is chosen. */}
      {required ? (
        <input
          aria-hidden="true"
          className={styles.requiredProxy}
          onChange={() => {}}
          required
          tabIndex={-1}
          value={sent}
        />
      ) : null}
    </div>
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
