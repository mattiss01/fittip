"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { logCompletionAction } from "./actions";
import {
  ActualActivities,
  type LogPlannedActivityView,
  type LogRecordedActivityView,
} from "./actual-activities";
import {
  COMPLETION_FEELING_CHOICES,
  COMPLETION_OUTCOME_LABELS,
  COMPLETION_SAFETY_NOTICE,
  COMPLETION_SIGNALS,
  INITIAL_LOG_ACTION_STATE,
  PLANNED_OUTCOMES,
  TRAINED_OUTCOMES,
  UNPLANNED_OUTCOME,
  type CompletionOutcome,
  type LogActionState,
} from "./log-action-state";
import styles from "./log.module.css";

import homeStyles from "../home.module.css";
import { saveSessionDraftToLibraryAction } from "../plan/saved/actions";
import { SaveToLibrary } from "../plan/saved/save-to-library";
import type {
  LibraryActivityOption,
  SaveToLibrary as SaveActivityToLibrary,
  UpdateInLibrary,
} from "@/components/training/activity-editor";
import {
  SavedSessionPicker,
  type SavedSessionOption,
} from "@/components/training/saved-session-picker";

/** The planned session this log answers to, when there is one. */
export type LogPlannedView = {
  id: string;
  localDate: string;
  /** The planned day in words, e.g. "Thu 1 Oct", formatted by the page. */
  dayLabel: string;
  title: string;
  sport: string;
  expectedDurationMinutes: number | null;
  /**
   * In plan order: the live plan's on a create, the snapshot's on an edit,
   * which is what the log was measured against.
   */
  activities: LogPlannedActivityView[];
};

/** The record being edited, as the owner last read it. */
export type LogExistingView = {
  id: string;
  revision: number;
  outcome: CompletionOutcome;
  actualLocalDate: string;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: string | null;
  note: string | null;
  replacementDescription: string | null;
  /**
   * The log's own name, or the snapshot's for a log written before logs
   * carried one. Null only on unplanned training that never had a name.
   */
  title: string | null;
  sport: string | null;
  /** What the log records per activity, in the order it was done. */
  activities: LogRecordedActivityView[];
  /** The unplanned log a replaced one points at, if it points anywhere. */
  replacedById: string | null;
  pain: boolean;
  illness: boolean;
  injury: boolean;
  severeFatigue: boolean;
};

type Props = {
  planned: LogPlannedView | null;
  existing: LogExistingView | null;
  /** The date the form starts on: the planned day, or the day it was opened. */
  defaultDate: string;
  /**
   * Owner-local today. The input stops here so the owner is told before the
   * round trip; the rule itself lives in the write function, because a check
   * only the form performs is a courtesy rather than a constraint.
   */
  today: string;
  /**
   * Set when this planned session already carries a log, so the owner is told
   * before filling anything in rather than refused at the end. It lives here
   * rather than replacing the form on the page because a server action
   * refreshes the page it was called from: deciding this on the server would
   * turn the owner's own receipt into this notice the moment they saved.
   */
  alreadyLogged?: { id: string; dayLabel: string } | null;
  /** The day on Today the owner returns to once the write lands. */
  returnDate: string;
  /**
   * Where Cancel and the receipt lead instead of the day on Today, when the
   * editor was opened from somewhere else. Built by the page from a fixed
   * list, never from a URL the request carried.
   */
  returnTo?: { href: string; label: string };
  /**
   * Unplanned training a replaced log may point at: this owner's, from a
   * week before the planned day to today, most recent first.
   */
  unplannedOptions?: LogUnplannedOption[];
  /**
   * Saved sessions an unplanned create may start from. Offered only there:
   * a planned log starts from its plan, and an edit from its record.
   */
  savedSessions?: SavedSessionOption[];
  /** The owner's activity library, for "Add activity from library" on any row list. */
  library?: LibraryActivityOption[];
  /** Saves one row as a library definition; absent, no row offers it. */
  saveActivityToLibrary?: SaveActivityToLibrary;
  /** Updates the definition a row came from; absent, no row offers it. */
  updateActivityInLibrary?: UpdateInLibrary;
};

/** One unplanned log a replaced one may point at, already in words. */
export type LogUnplannedOption = { id: string; label: string };

/**
 * The questions a log can ask, in the order it asks them. Which of them a
 * given log asks is `stepsFor`'s to say.
 */
type Step =
  | "what"
  | "date"
  | "outcome"
  | "replaced"
  | "day"
  | "minutes"
  | "effort"
  | "feeling"
  | "activities"
  | "off"
  | "note"
  | "summary";

/** Every question in the order it can be asked, the summary last (R4). */
const STEP_ORDER: Step[] = [
  "outcome",
  "date",
  "what",
  "replaced",
  "day",
  "minutes",
  "effort",
  "feeling",
  "activities",
  "off",
  "note",
  "summary",
];

const STEP_QUESTIONS: Record<Step, string> = {
  what: "What did you do?",
  date: "When was it?",
  outcome: "How did it go?",
  replaced: "What did you do instead?",
  day: "Instead of the planned session, or extra?",
  minutes: "How long?",
  effort: "How hard was it?",
  feeling: "How did it feel?",
  activities: "What did you do in it?",
  off: "Anything off?",
  note: "Anything to add?",
  summary: "Your log",
};

/**
 * Logging in steps (owner, 3 Oct 2026, from the prototype's variant B): one
 * question at a time, a tap answers it and moves on, and "Anything off?" is
 * answered with a signal or with "Nothing was off", never passed by. A
 * correction opens on the summary, where each answer has its own Change.
 *
 * It is still one `<form>` sending what the one-page form sent. Every
 * question is mounted and only the current one is shown, so an answer given
 * three steps back is still in the form when it is saved, and the write
 * function, its payload and its rules are untouched. What a question does not
 * apply to is not rendered at all, as before, so it sends nothing.
 */
export function LogForm({
  planned,
  existing,
  alreadyLogged = null,
  defaultDate,
  today,
  returnDate,
  returnTo,
  unplannedOptions = [],
  savedSessions = [],
  library = [],
  saveActivityToLibrary,
  updateActivityInLibrary,
}: Props) {
  const [state, action, pending] = useActionState<LogActionState, FormData>(
    logCompletionAction,
    INITIAL_LOG_ACTION_STATE,
  );
  const choices = planned === null ? [UNPLANNED_OUTCOME] : PLANNED_OUTCOMES;
  const [outcome, setOutcome] = useState<CompletionOutcome>(
    existing?.outcome ?? choices[0].value,
  );
  // A new planned log has not been told how it went yet; the outcome step is
  // answered by a tap, not by a default the owner never chose.
  const [outcomeChosen, setOutcomeChosen] = useState(
    existing !== null || choices.length === 1,
  );
  const [actualDate, setActualDate] = useState(
    existing?.actualLocalDate ?? defaultDate,
  );
  const [dateOpen, setDateOpen] = useState(false);
  const [dayChoice, setDayChoice] = useState<"instead" | "extra" | null>(null);
  // The saved session an unplanned create started from, or "". Picking one
  // replaces the title, sport and activity list with its values — a copy by
  // value, as the Plan's reuse is.
  const [startFrom, setStartFrom] = useState("");
  const startingSession =
    planned === null && existing === null
      ? savedSessions.find((session) => session.id === startFrom)
      : undefined;
  const [title, setTitle] = useState(existing?.title ?? planned?.title ?? "");
  const [sport, setSport] = useState(existing?.sport ?? planned?.sport ?? "");
  // A new log starts at what the plan expected, or at 0 (owner, 3 Oct 2026);
  // a correction at what was recorded.
  const [minutes, setMinutes] = useState<string>(
    String(
      existing === null
        ? (planned?.expectedDurationMinutes ?? 0)
        : (existing.durationMinutes ?? ""),
    ),
  );
  const [effort, setEffort] = useState<number | null>(
    existing?.perceivedEffort ?? null,
  );
  const [feeling, setFeeling] = useState<string>(existing?.feeling ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [signals, setSignals] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        COMPLETION_SIGNALS.map((signal) => signal.name).filter((name) =>
          defaultSignal(existing, name),
        ),
      ),
  );
  // A correction has answered every question already.
  const [signalsAnswered, setSignalsAnswered] = useState(existing !== null);

  const [step, setStep] = useState<Step>(
    existing !== null ? "summary" : choices.length > 1 ? "outcome" : "what",
  );
  // The date is asked only when the owner taps its Change, and returns to
  // the question it was opened from.
  const [dateReturn, setDateReturn] = useState<Step | null>(null);
  // Opened from the summary, a step returns there rather than walking on.
  const [fromSummary, setFromSummary] = useState(false);

  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // The step whose heading last had focus, so focus moves only on a change
  // of step, not on mount (nor on a development double effect).
  const shownStep = useRef<Step>(step);
  // A field Save found invalid, reported once its step is on screen.
  const reportAfter = useRef<HTMLElement | null>(null);
  // The outcome Extra replaced, given back if the owner picks Instead.
  const outcomeBeforeExtra = useRef<CompletionOutcome | null>(null);
  // Two answers live inside their own components; the summary reads them
  // from the form once it has rendered, never during a render.
  const [observed, setObserved] = useState(() => ({
    activities: countPhrase(existing?.activities.length ?? 0),
    replacement: "Not said yet",
  }));
  const saved = state.status === "saved";
  const skipped = outcome === "skipped";
  const activitiesHappened =
    outcome === "completed" ||
    outcome === "partially_completed" ||
    outcome === "unplanned";
  // Done on another day than planned: only a new log asks, and only for
  // training that happened; a skip or a replacement is about the planned
  // session whatever day it is written on.
  const askWhichDay =
    planned !== null &&
    existing === null &&
    actualDate !== planned.localDate &&
    TRAINED_OUTCOMES.has(outcome);
  const extraChosen = askWhichDay && dayChoice === "extra";
  const status =
    choices.length === 1
      ? choices[0].value
      : extraChosen
        ? "completed"
        : outcome;
  const asksNumbers = !skipped && outcome !== "replaced";
  // Everything the chosen outcome would discard from a record that already
  // exists. A question this form stops rendering submits nothing, and the
  // write function assigns every one of these from the payload, so an absent
  // key stores null.
  const discarded =
    existing === null
      ? []
      : [
          ...(skipped && existing.durationMinutes !== null
            ? ["the duration"]
            : []),
          ...(skipped && existing.perceivedEffort !== null
            ? ["the effort"]
            : []),
          ...(skipped && existing.feeling !== null ? ["how it felt"] : []),
          ...(outcome !== "replaced" && existing.replacementDescription !== null
            ? ["what you did instead"]
            : []),
          ...(!activitiesHappened && existing.activities.length > 0
            ? ["the activities"]
            : []),
        ];

  /**
   * The questions a log asks for a given outcome and day answer: the one
   * rule, read both for the steps shown now and for what follows the moment
   * an outcome is tapped, before the new outcome has rendered.
   */
  function stepsFor(
    forOutcome: CompletionOutcome,
    forDay: "instead" | "extra" | null,
  ): Step[] {
    const trained = TRAINED_OUTCOMES.has(forOutcome);
    const whichDay =
      planned !== null &&
      existing === null &&
      actualDate !== planned.localDate &&
      trained;
    // How it went comes first (owner, 3 Oct 2026): a skip or a replacement
    // is not asked what was done, and keeps the plan's name for the log.
    // "How did it feel?" is no longer asked (owner, same day); a feeling an
    // older log carries is kept, shown and correctable from its summary.
    const happened = forOutcome !== "skipped" && forOutcome !== "replaced";
    return [
      ...(choices.length > 1 && !(whichDay && forDay === "extra")
        ? (["outcome"] as const)
        : []),
      ...(happened ? (["what"] as const) : []),
      ...(forOutcome === "replaced" ? (["replaced"] as const) : []),
      ...(whichDay ? (["day"] as const) : []),
      ...(happened ? (["minutes", "effort"] as const) : ([] as const)),
      ...(trained || forOutcome === "unplanned"
        ? (["activities"] as const)
        : []),
      "off",
      "note",
    ];
  }
  const steps = stepsFor(outcome, dayChoice);
  const index = steps.indexOf(step);

  // The receipt replaces the form, and each step replaces the last: focus
  // goes to the new heading so a keyboard or screen-reader user is told.
  useEffect(() => {
    if (saved) receiptHeading.current?.focus();
  }, [saved, state.submission]);
  // R4 (owner, 3 Oct 2026): a question slides in from the right going on,
  // from the left going back. Set before the frame is drawn, so the shown
  // question starts with the right direction; reduced motion is the CSS's.
  const lastOrder = useRef(STEP_ORDER.indexOf(step));
  useLayoutEffect(() => {
    const order = STEP_ORDER.indexOf(step);
    if (order === lastOrder.current || formRef.current === null) return;
    formRef.current.dataset.logDirection =
      order > lastOrder.current ? "forward" : "back";
    lastOrder.current = order;
  }, [step]);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    stepHeading.current?.focus();
    const invalid = reportAfter.current;
    if (invalid !== null) {
      reportAfter.current = null;
      if ("reportValidity" in invalid) {
        (invalid as HTMLInputElement).reportValidity();
      }
    }
  }, [step]);
  useEffect(() => {
    if (step !== "summary" || formRef.current === null) return;
    const form = formRef.current;
    const listed = form.querySelector<HTMLInputElement>(
      'input[name="activities"]',
    );
    let count = existing?.activities.length ?? 0;
    try {
      const rows: unknown = JSON.parse(listed?.value ?? "");
      if (Array.isArray(rows)) count = rows.length;
    } catch {
      // No list in the form: what the record held.
    }
    const picked = form.querySelector<HTMLSelectElement>(
      'select[name="replacedByCompletionId"]',
    );
    const named = form.querySelector<HTMLInputElement>(
      'input[name="replacement.title"]',
    )?.value;
    setObserved({
      activities: countPhrase(count),
      replacement: picked
        ? (picked.selectedOptions[0]?.textContent ?? "Chosen")
        : named
          ? named
          : "Not said yet",
    });
  }, [step, outcome, existing]);

  if (alreadyLogged !== null && !saved) {
    return (
      <section className={homeStyles.stateCard} data-log-state="already-logged">
        <p className={homeStyles.sectionLabel}>Already logged</p>
        <h2>This session is already logged.</h2>
        <p>
          The log is dated {alreadyLogged.dayLabel}. One planned session carries
          one log, and that log can be corrected.
        </p>
        <div className={homeStyles.actions}>
          <Link
            className={homeStyles.primaryAction}
            href={`/home/log?completion=${alreadyLogged.id}`}
          >
            Open that log
          </Link>
        </div>
      </section>
    );
  }

  if (saved) {
    return (
      <section
        className={styles.receipt}
        data-log-receipt={state.result}
        role="status"
        aria-live="polite"
      >
        <h2 ref={receiptHeading} tabIndex={-1}>
          {state.message}
        </h2>
        <Link
          className={styles.primary}
          href={
            returnTo?.href ??
            `/home/today?date=${state.returnDate ?? returnDate}`
          }
        >
          {returnTo?.label ?? "Back to that day"}
        </Link>
        {state.completionId === undefined || !state.reusable ? null : (
          <SaveToLibrary completionId={state.completionId} />
        )}
      </section>
    );
  }

  /** Every field in the shown step must hold before the next one is asked. */
  function stepIsValid(): boolean {
    const section = formRef.current?.querySelector<HTMLElement>(
      `[data-log-step="${step}"]`,
    );
    const invalid = section ? firstInvalid(section) : null;
    invalid?.reportValidity();
    return invalid === null;
  }

  /**
   * Save from the summary checks every question first. A browser refuses to
   * submit a form whose invalid field is hidden, and says nothing, so the
   * question holding it is opened and the field reported there instead.
   */
  function checkBeforeSave(event: React.MouseEvent<HTMLButtonElement>) {
    const invalid = formRef.current ? firstInvalid(formRef.current) : null;
    if (invalid === null) return;
    event.preventDefault();
    const target = invalid
      .closest("[data-log-step]")
      ?.getAttribute("data-log-step") as Step | null;
    if (target === null || target === "summary") {
      invalid.reportValidity();
      return;
    }
    if (target === "date") setDateOpen(true);
    reportAfter.current = invalid;
    change(target);
  }

  /** On to the next question, or back to the summary it was opened from. */
  function advance(list: Step[] = steps, from: Step = step) {
    if (fromSummary) {
      setFromSummary(false);
      setStep("summary");
      return;
    }
    if (from === "date") {
      setStep(dateReturn ?? list[0]);
      setDateReturn(null);
      return;
    }
    setStep(list[list.indexOf(from) + 1] ?? "summary");
  }

  function openDate() {
    setDateOpen(true);
    if (!fromSummary) setDateReturn(step);
    setStep("date");
  }

  function next() {
    if (stepIsValid()) advance();
  }

  function back() {
    // Back to the summary is an answer too: it must hold, or Save would be
    // refused with the field out of sight.
    if (fromSummary && !stepIsValid()) return;
    if (fromSummary || step === "summary") {
      setFromSummary(false);
      setStep("summary");
      return;
    }
    if (step === "date") {
      setStep(dateReturn ?? steps[0]);
      setDateReturn(null);
      return;
    }
    setStep(steps[Math.max(0, index - 1)]);
  }

  function change(target: Step) {
    setFromSummary(true);
    setStep(target);
  }

  const showBack =
    step !== "summary" &&
    (fromSummary || existing !== null || index > 0 || step === "date");
  // Off the ordered list: the summary, and the date detour.
  const offList = step === "summary" || step === "date" || fromSummary;
  /* The day the log is for, as one line on the first question. */
  const dateLine = (
    <p className={styles.dateLine} data-log-date-line>
      For {dayLabel(actualDate)}
      <button
        className={styles.inlineChange}
        type="button"
        onClick={openDate}
        aria-label={`Change the date, ${dayLabel(actualDate)}`}
      >
        Change
      </button>
    </p>
  );
  const close = returnTo?.href ?? `/home/today?date=${returnDate}`;

  return (
    <form
      ref={formRef}
      className={styles.form}
      action={action}
      data-log-form
      data-log-step-current={step}
      onSubmit={(event) => {
        // Enter in a text field submits the form; mid-way it means "next".
        if (step !== "summary") {
          event.preventDefault();
          next();
        }
      }}
    >
      <input
        type="hidden"
        name="operation"
        value={existing === null ? "create" : "edit"}
      />
      {existing === null ? null : (
        <>
          <input type="hidden" name="completionId" value={existing.id} />
          <input
            type="hidden"
            name="expectedRevision"
            value={existing.revision}
          />
        </>
      )}
      {planned === null || existing !== null ? null : (
        <>
          <input type="hidden" name="plannedSessionId" value={planned.id} />
          <input type="hidden" name="plannedDate" value={planned.localDate} />
        </>
      )}
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="actualLocalDate" value={actualDate} />
      {askWhichDay && dayChoice !== null ? (
        <input type="hidden" name="dayChoice" value={dayChoice} />
      ) : null}
      {asksNumbers ? (
        <>
          <input type="hidden" name="perceivedEffort" value={effort ?? ""} />
          <input type="hidden" name="feeling" value={feeling} />
        </>
      ) : null}
      {COMPLETION_SIGNALS.filter((signal) => signals.has(signal.name)).map(
        (signal) => (
          <input
            key={signal.name}
            type="hidden"
            name={signal.name}
            value="true"
          />
        ),
      )}

      <div className={styles.stepBar}>
        {showBack ? (
          <button className={styles.stepBack} type="button" onClick={back}>
            <span aria-hidden="true">&lsaquo;&nbsp;</span>
            {fromSummary || existing !== null ? "Summary" : "Back"}
          </button>
        ) : (
          <span />
        )}
        <span className={styles.stepCount}>
          {offList ? "" : `${index + 1} of ${steps.length}`}
        </span>
        <Link className={styles.stepClose} href={close}>
          Cancel
        </Link>
      </div>
      {offList ? null : (
        <div className={styles.progress} aria-hidden="true">
          {steps.map((name, position) => (
            <span key={name} data-on={position <= index} />
          ))}
        </div>
      )}

      <p
        className={state.status === "idle" ? styles.srOnly : styles.notice}
        data-state={state.status}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>

      <h2
        key={step}
        className={styles.question}
        ref={stepHeading}
        tabIndex={-1}
      >
        {STEP_QUESTIONS[step]}
      </h2>

      {/* ---- What did you do? ---- */}
      <section data-log-step="what" hidden={step !== "what"}>
        {planned !== null || existing !== null ? null : (
          <SavedSessionPicker
            sessions={savedSessions}
            picked={startingSession}
            onPick={(session) => {
              setStartFrom(session.id);
              setTitle(session.title);
              setSport(session.sport);
            }}
          />
        )}
        {/* Every log carries its own name. A planned one starts as the plan's,
            and changing it here renames the log alone. */}
        <div className={styles.field}>
          <label htmlFor="log-title">Title</label>
          <input
            id="log-title"
            name="title"
            type="text"
            required
            maxLength={120}
            autoComplete="off"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {planned === null ? null : (
            <span className={styles.fieldHint}>
              Taken from the plan. Change it if you did something else; the plan
              keeps its own.
            </span>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="log-sport">Sport</label>
          <input
            id="log-sport"
            name="sport"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            value={sport}
            onChange={(event) => setSport(event.target.value)}
          />
        </div>
        {/* On whichever question comes first: here for unplanned training,
            and after Extra, which takes "How did it go?" away. */}
        {steps[0] === "what" ? dateLine : null}
        <button className={styles.primary} type="button" onClick={next}>
          {fromSummary ? "Back to summary" : "Next"}
        </button>
      </section>

      {/* ---- When was it? Only once the owner asks to change the day. ---- */}
      {dateOpen ? (
        <section data-log-step="date" hidden={step !== "date"}>
          <div className={styles.field}>
            <label htmlFor="log-date">Date</label>
            <input
              id="log-date"
              type="date"
              required
              max={today}
              value={actualDate}
              onChange={(event) => {
                setActualDate(event.target.value);
                setDayChoice(null);
              }}
            />
            <span className={styles.fieldHint}>
              Training cannot be logged before it happens, so this stops at
              today.
            </span>
          </div>
          <button className={styles.primary} type="button" onClick={next}>
            {fromSummary ? "Back to summary" : "Next"}
          </button>
        </section>
      ) : null}

      {/* ---- How did it go? ---- */}
      {choices.length > 1 ? (
        <section data-log-step="outcome" hidden={step !== "outcome"}>
          {dateLine}
          <div
            className={styles.bigChoices}
            role="group"
            aria-label="What happened"
          >
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={outcomeChosen && outcome === choice.value}
                data-selected={outcomeChosen && outcome === choice.value}
                onClick={() => {
                  const nextOutcome = choice.value;
                  setOutcome(nextOutcome);
                  setOutcomeChosen(true);
                  // The step after this one depends on the answer just given.
                  const nextSteps = stepsFor(nextOutcome, dayChoice);
                  if (fromSummary) {
                    // A replacement needs its own answer before the summary.
                    if (nextOutcome === "replaced") {
                      setStep("replaced");
                    } else {
                      setFromSummary(false);
                      setStep("summary");
                    }
                    return;
                  }
                  setStep(nextSteps[nextSteps.indexOf("outcome") + 1] ?? "off");
                }}
              >
                <strong>{choice.label}</strong>
                <span>{choice.hint}</span>
              </button>
            ))}
          </div>
          {discarded.length === 0 ? null : (
            <p className={styles.warning} data-log-clears role="status">
              Saving this as {COMPLETION_OUTCOME_LABELS[outcome].toLowerCase()}{" "}
              removes {listPhrase(discarded)}. Your note and anything you
              reported stay.
            </p>
          )}
        </section>
      ) : null}

      {/* ---- What did you do instead? ---- */}
      {outcome === "replaced" ? (
        <section data-log-step="replaced" hidden={step !== "replaced"}>
          <ReplacedBy
            options={unplannedOptions}
            linkedId={existing?.replacedById ?? null}
            legacyText={existing?.replacementDescription ?? null}
            sessionSport={planned?.sport ?? ""}
            library={library}
            saveToLibrary={saveActivityToLibrary}
            updateInLibrary={updateActivityInLibrary}
          />
          <button className={styles.primary} type="button" onClick={next}>
            {fromSummary ? "Back to summary" : "Next"}
          </button>
        </section>
      ) : null}

      {/* ---- Instead, or extra? ---- */}
      {askWhichDay && planned !== null ? (
        <section data-log-step="day" hidden={step !== "day"}>
          <p className={styles.sub}>
            This session is planned for {planned.dayLabel}.
          </p>
          <div
            className={styles.bigChoices}
            data-log-day-choice
            role="group"
            aria-label="Instead, or extra"
          >
            <button
              type="button"
              aria-pressed={dayChoice === "instead"}
              data-selected={dayChoice === "instead"}
              onClick={() => {
                setDayChoice("instead");
                if (outcomeBeforeExtra.current !== null) {
                  setOutcome(outcomeBeforeExtra.current);
                  outcomeBeforeExtra.current = null;
                }
                advance();
              }}
            >
              <strong>Instead of {planned.dayLabel}&rsquo;s session</strong>
              <span>{planned.dayLabel} shows it as logged on this date.</span>
            </button>
            <button
              type="button"
              aria-pressed={dayChoice === "extra"}
              data-selected={dayChoice === "extra"}
              onClick={() => {
                setDayChoice("extra");
                // "Partly completed" means something only against a plan;
                // kept, in case the owner changes their mind.
                outcomeBeforeExtra.current = outcome;
                setOutcome("completed");
                advance();
              }}
            >
              <strong>
                Extra &mdash; I&rsquo;ll still do {planned.dayLabel}
              </strong>
              <span>
                Saved as its own unplanned log. {planned.dayLabel} stays
                planned.
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* ---- How long? ---- */}
      {asksNumbers ? (
        <section data-log-step="minutes" hidden={step !== "minutes"}>
          {planned?.expectedDurationMinutes == null ? null : (
            <p className={styles.sub}>
              {planned.expectedDurationMinutes} min planned
            </p>
          )}
          <div className={styles.stepper}>
            <button
              type="button"
              aria-label="5 minutes less"
              onClick={() =>
                setMinutes(String(Math.max(0, (Number(minutes) || 0) - 5)))
              }
            >
              &minus;5
            </button>
            <label className={styles.stepperValue}>
              <span className={styles.srOnly}>Duration (minutes)</span>
              <input
                id="log-duration"
                type="number"
                inputMode="numeric"
                min={0}
                max={10080}
                step={1}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
              <span aria-hidden="true">min</span>
            </label>
            {/* 0 marks where the number goes and means "not entered" (owner,
                3 Oct 2026): it is sent as no duration, so nothing reads
                "0 min" afterwards. */}
            <input
              type="hidden"
              name="durationMinutes"
              value={durationEntered(minutes) ? minutes : ""}
            />
            <button
              type="button"
              aria-label="5 minutes more"
              onClick={() => setMinutes(String((Number(minutes) || 0) + 5))}
            >
              +5
            </button>
          </div>
          <button className={styles.primary} type="button" onClick={next}>
            {fromSummary ? "Back to summary" : "Next"}
          </button>
        </section>
      ) : null}

      {/* ---- How hard? ---- */}
      {asksNumbers ? (
        <section data-log-step="effort" hidden={step !== "effort"}>
          <p className={styles.sub}>1 is barely anything, 10 is everything.</p>
          <div
            className={styles.effortGrid}
            role="group"
            aria-label="Effort (1-10)"
          >
            {Array.from({ length: 10 }, (_, position) => position + 1).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={effort === value}
                  data-selected={effort === value}
                  onClick={() => {
                    setEffort(value);
                    advance();
                  }}
                >
                  {value}
                </button>
              ),
            )}
          </div>
          <button
            className={styles.skipQuestion}
            type="button"
            onClick={() => {
              setEffort(null);
              advance();
            }}
          >
            {fromSummary && effort !== null
              ? "Remove this answer"
              : "Skip this question"}
          </button>
        </section>
      ) : null}

      {/* ---- How did it feel? ---- */}
      {asksNumbers ? (
        <section data-log-step="feeling" hidden={step !== "feeling"}>
          <div
            className={styles.bigChoices}
            role="group"
            aria-label="How it felt"
          >
            {[...COMPLETION_FEELING_CHOICES].reverse().map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={feeling === choice.value}
                data-selected={feeling === choice.value}
                onClick={() => {
                  setFeeling(choice.value);
                  advance();
                }}
              >
                <strong>{choice.label}</strong>
              </button>
            ))}
          </div>
          <button
            className={styles.skipQuestion}
            type="button"
            onClick={() => {
              setFeeling("");
              advance();
            }}
          >
            {fromSummary && feeling !== ""
              ? "Remove this answer"
              : "Skip this question"}
          </button>
        </section>
      ) : null}

      {/* ---- Activities. Always mounted, so the list keeps its rows; it
          sends nothing while the outcome says they did not happen. ---- */}
      <section data-log-step="activities" hidden={step !== "activities"}>
        <ActualActivities
          key={`activities-${startFrom}`}
          activities={planned?.activities ?? []}
          recorded={existing?.activities}
          starting={startingSession?.activities}
          library={library}
          saveToLibrary={saveActivityToLibrary}
          updateInLibrary={updateActivityInLibrary}
          sessionSport={
            startingSession?.sport ?? planned?.sport ?? existing?.sport ?? ""
          }
          inactive={!activitiesHappened}
        />
        {activitiesHappened ? <SaveFormToLibrary formRef={formRef} /> : null}
        <button className={styles.primary} type="button" onClick={next}>
          {fromSummary ? "Back to summary" : "Next"}
        </button>
      </section>

      {/* ---- Anything off? Never passed by: a signal, or "Nothing was off". */}
      <section data-log-step="off" hidden={step !== "off"}>
        <p className={styles.sub}>
          Pick any that apply. FitTip records these as facts you reported; it
          does not diagnose, and it changes nothing on your plan.
        </p>
        <div
          className={styles.bigChoices}
          role="group"
          aria-label="Anything to report"
        >
          {COMPLETION_SIGNALS.map((signal) => (
            <button
              key={signal.name}
              type="button"
              aria-pressed={signals.has(signal.name)}
              data-selected={signals.has(signal.name)}
              onClick={() => {
                const nextSignals = new Set(signals);
                if (nextSignals.has(signal.name)) {
                  nextSignals.delete(signal.name);
                } else {
                  nextSignals.add(signal.name);
                }
                setSignals(nextSignals);
              }}
            >
              <strong>{signal.label}</strong>
            </button>
          ))}
        </div>
        {/* The established notice, wherever a signal can be reported. */}
        <p className={styles.safety}>{COMPLETION_SAFETY_NOTICE}</p>
        {signals.size > 0 ? (
          <>
            <button
              className={styles.primary}
              type="button"
              onClick={() => {
                setSignalsAnswered(true);
                advance();
              }}
            >
              {fromSummary ? "Back to summary" : "Next"}
            </button>
          </>
        ) : (
          <button
            className={styles.primary}
            type="button"
            onClick={() => {
              setSignalsAnswered(true);
              advance();
            }}
          >
            Nothing was off
          </button>
        )}
      </section>

      {/* ---- Anything to add? ---- */}
      <section data-log-step="note" hidden={step !== "note"}>
        <div className={styles.field}>
          <label htmlFor="log-note">Note (optional)</label>
          <textarea
            id="log-note"
            name="note"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <button className={styles.primary} type="button" onClick={next}>
          {fromSummary ? "Back to summary" : "Next"}
        </button>
      </section>

      {/* ---- The summary: where a new log ends and a correction starts,
          one Change per answer (prototype B; owner, 3 Oct 2026). ---- */}
      {step === "summary" ? (
        <section data-log-step="summary">
          <dl className={styles.summary}>
            {summaryRows().map(([target, term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
                <button
                  type="button"
                  aria-label={`Change ${term.toLowerCase()}`}
                  onClick={() => {
                    if (target === "date") setDateOpen(true);
                    change(target);
                  }}
                >
                  Change
                </button>
              </div>
            ))}
          </dl>
          {discarded.length === 0 ? null : (
            <p className={styles.warning} data-log-clears role="status">
              Saving this as {COMPLETION_OUTCOME_LABELS[outcome].toLowerCase()}{" "}
              removes {listPhrase(discarded)}. Your note and anything you
              reported stay.
            </p>
          )}
          <button
            className={styles.primary}
            type="submit"
            disabled={pending || !signalsAnswered}
            onClick={checkBeforeSave}
          >
            {pending ? "Saving…" : "Save log"}
          </button>
        </section>
      ) : null}
    </form>
  );

  function summaryRows(): [Step, string, string][] {
    const feelingLabel = COMPLETION_FEELING_CHOICES.find(
      (choice) => choice.value === feeling,
    )?.label;
    const reported = COMPLETION_SIGNALS.filter((signal) =>
      signals.has(signal.name),
    ).map((signal) => signal.label);
    return [
      ...(steps.includes("what")
        ? ([["what", "What", [title, sport].filter(Boolean).join(" · ")]] as [
            Step,
            string,
            string,
          ][])
        : []),
      ["date", "Date", dayLabel(actualDate)],
      ...(choices.length > 1 && !extraChosen
        ? ([["outcome", "How it went", COMPLETION_OUTCOME_LABELS[outcome]]] as [
            Step,
            string,
            string,
          ][])
        : []),
      ...(outcome === "replaced"
        ? ([["replaced", "Instead", observed.replacement]] as [
            Step,
            string,
            string,
          ][])
        : []),
      ...(asksNumbers
        ? ([
            [
              "minutes",
              "Duration",
              durationEntered(minutes) ? `${minutes} min` : "—",
            ],
            ["effort", "Effort", effort === null ? "—" : `${effort} of 10`],
            ...(feelingLabel === undefined
              ? []
              : ([["feeling", "Felt", feelingLabel]] as [
                  Step,
                  string,
                  string,
                ][])),
          ] as [Step, string, string][])
        : []),
      ...(activitiesHappened
        ? ([["activities", "Activities", observed.activities]] as [
            Step,
            string,
            string,
          ][])
        : []),
      [
        "off",
        "Anything off",
        reported.length === 0 ? "Nothing" : reported.join(", "),
      ],
      ["note", "Note", note.trim() === "" ? "—" : note],
    ];
  }
}

/** The first field in a part of the form that would refuse the submit. */
function firstInvalid(scope: ParentNode): HTMLInputElement | null {
  for (const control of scope.querySelectorAll<HTMLInputElement>(
    "input, select, textarea",
  )) {
    if (control.type === "hidden" || control.disabled) continue;
    if (!control.checkValidity()) return control;
  }
  return null;
}

/** A duration the owner set: anything but blank or the starting 0. */
function durationEntered(minutes: string): boolean {
  return minutes.trim() !== "" && Number(minutes) !== 0;
}

function countPhrase(count: number): string {
  return count === 0
    ? "None"
    : count === 1
      ? "1 activity"
      : `${count} activities`;
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dayLabel(localDate: string): string {
  const parsed = Date.parse(`${localDate}T00:00:00.000Z`);
  return Number.isFinite(parsed)
    ? DAY_LABEL.format(new Date(parsed))
    : localDate;
}

/** "a, b and c", so the warning names every field rather than a count. */
function listPhrase(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function defaultSignal(existing: LogExistingView | null, name: string) {
  if (existing === null) return false;
  if (name === "painReported") return existing.pain;
  if (name === "illnessReported") return existing.illness;
  if (name === "injuryReported") return existing.injury;
  return existing.severeFatigue;
}

/**
 * What a replaced session was replaced by: training logged now, in this same
 * save, or training already logged. The owner decided on 25 September 2026
 * that a replaced session must point at one or the other, since without it a
 * replaced session is only a skipped one.
 *
 * The numbers belong here rather than on the planned log, because they
 * describe what was actually done. The planned log keeps its date, note and
 * anything reported. A log written before the link keeps the text it was
 * written with, shown and sent back unchanged beside whatever it now points
 * at.
 */
function ReplacedBy({
  options,
  linkedId,
  legacyText,
  sessionSport,
  library,
  saveToLibrary,
  updateInLibrary,
}: {
  options: LogUnplannedOption[];
  linkedId: string | null;
  legacyText: string | null;
  sessionSport: string;
  library: LibraryActivityOption[];
  saveToLibrary?: SaveActivityToLibrary;
  updateInLibrary?: UpdateInLibrary;
}) {
  const [mode, setMode] = useState<"new" | "existing">(
    linkedId !== null && options.some((option) => option.id === linkedId)
      ? "existing"
      : "new",
  );
  return (
    <fieldset className={styles.activities} data-log-replaced-by>
      <legend>What you did instead</legend>
      {legacyText === null ? null : (
        <>
          <p className={styles.fieldHint}>
            You wrote: &ldquo;{legacyText}&rdquo;. That stays; point it at the
            training it describes.
          </p>
          <input
            type="hidden"
            name="replacementDescription"
            value={legacyText}
          />
        </>
      )}
      <label className={styles.checkField}>
        <input
          type="radio"
          name="replacementMode"
          value="new"
          checked={mode === "new"}
          onChange={() => setMode("new")}
        />
        <span>Log it now</span>
      </label>
      <label className={styles.checkField}>
        <input
          type="radio"
          name="replacementMode"
          value="existing"
          checked={mode === "existing"}
          disabled={options.length === 0}
          onChange={() => setMode("existing")}
        />
        <span>I already logged it</span>
      </label>
      {options.length === 0 ? (
        <p className={styles.fieldHint}>
          Nothing unplanned is logged from the week before this session to
          today, so log it now.
        </p>
      ) : null}

      {mode === "existing" && options.length > 0 ? (
        <div className={styles.field}>
          <label htmlFor="log-replaced-by">Which training</label>
          <select
            id="log-replaced-by"
            name="replacedByCompletionId"
            defaultValue={linkedId ?? options[0].id}
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <label htmlFor="log-replacement-title">Title of what you did</label>
            <input
              id="log-replacement-title"
              name="replacement.title"
              type="text"
              required
              maxLength={120}
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="log-replacement-sport">Sport of what you did</label>
            <input
              id="log-replacement-sport"
              name="replacement.sport"
              type="text"
              required
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <div className={styles.fieldPair}>
            <div className={styles.field}>
              <label htmlFor="log-replacement-duration">
                Duration (minutes)
              </label>
              <input
                id="log-replacement-duration"
                name="replacement.durationMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={10080}
                step={1}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="log-replacement-effort">Effort (1-10)</label>
              <input
                id="log-replacement-effort"
                name="replacement.perceivedEffort"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                step={1}
              />
            </div>
          </div>
          <ActualActivities
            name="replacement.activities"
            activities={[]}
            library={library}
            saveToLibrary={saveToLibrary}
            updateInLibrary={updateInLibrary}
            sessionSport={sessionSport}
          />
        </>
      )}
    </fieldset>
  );
}

/**
 * "Save session to library" while logging, before or without writing the
 * log (owner, 27 Sep 2026). It reads the form as it stands - title, sport,
 * duration and the activity list - so what is saved is what is on screen.
 * What was done becomes the saved session's targets, and the duration its
 * expected minutes. The entry is called what the log is called.
 */
function SaveFormToLibrary({
  formRef,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    const form = formRef.current;
    if (form === null) return;
    const values = new FormData(form);
    const minutes = Number(values.get("durationMinutes"));
    let activities: Record<string, unknown>[] = [];
    try {
      const raw = values.get("activities");
      activities = typeof raw === "string" ? JSON.parse(raw) : [];
    } catch {
      activities = [];
    }
    setSaving(true);
    try {
      const title = String(values.get("title") ?? "").trim();
      const result = await saveSessionDraftToLibraryAction({
        name: title,
        title,
        sport: String(values.get("sport") ?? "").trim(),
        ...(Number.isInteger(minutes) && minutes > 0
          ? { expectedDurationMinutes: minutes }
          : {}),
        activities: activities.map((activity, position) => ({
          ...(typeof activity.personalActivityId === "string"
            ? { personalActivityId: activity.personalActivityId }
            : {}),
          position,
          name: activity.name,
          sport: activity.sport,
          measurementMode: activity.measurementMode,
          ...(activity.actualMeasurement == null
            ? {}
            : { target: activity.actualMeasurement }),
        })),
      });
      setNotice(result.message);
    } catch {
      setNotice("It could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className={styles.saveSession} data-log-save-session>
      <summary>Save session to library</summary>
      <p className={styles.fieldHint}>
        A copy of this log as it stands goes to your saved sessions, with what
        you did as its targets. The log itself is not saved by this.
      </p>
      <button
        className={styles.secondary}
        type="button"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving\u2026" : "Save to library"}
      </button>
      {notice === null ? null : (
        <p className={styles.fieldHint} role="status">
          {notice}
        </p>
      )}
    </details>
  );
}
