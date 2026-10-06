"use client";

import { useActionState, useState } from "react";

import styles from "@/app/home/you/onboarding/onboarding.module.css";
import { INITIAL_PROFILE_ACTION_STATE } from "@/app/home/you/profile-action-state";
import { saveTrainingSetupAction } from "@/app/home/you/profile-actions";
import {
  LaterButton,
  MeasureInput,
  ProfileNotice,
  useSaved,
} from "@/components/profile/profile-forms";
import {
  AVAILABILITY_NOTE_MAX_LENGTH,
  HOME_EQUIPMENT_PRESET_GROUPS,
  SESSIONS_PER_WEEK_RANGE,
  TRAINING_NAME_MAX_LENGTH,
  TRAINING_PLACE_PRESETS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  trainsAtHome,
  type TrainingSetupView,
} from "@/lib/training/training-setup";

/**
 * The training setup (owner, 5 and 6 Oct 2026): how often the owner wants to
 * train, which days are out, where they can train and what they have at home.
 * Guided setup asks each on a screen of its own and saves it with Next;
 * Settings shows all four in one form. They are settings of the profile and
 * never become memory items.
 */
export const TRAINING_QUESTIONS = {
  frequency: {
    heading: "How often do you want to train?",
    caption: "Sessions a week. A rough number is enough",
  },
  days: {
    heading: "Any days you can't train?",
    caption: "Tap the days that are out. Every other day counts as free",
  },
  places: {
    heading: "Where can you train?",
    caption: "Select every place you can use",
  },
  equipment: {
    heading: "What do you have at home?",
    caption: "Select what you can train with at home",
  },
} as const;
export type TrainingQuestion = keyof typeof TRAINING_QUESTIONS;

type StepProps = {
  training: TrainingSetupView;
  submitLabel: string;
  /** Setup moves on; Settings stays and says it is saved. */
  onSaved?: () => void;
  /** Setup only: where "Continue later" goes once the answer is saved. */
  onLater?: () => void;
};

/** One of the four questions, as guided setup asks it. */
export function TrainingQuestionForm({
  question,
  training,
  submitLabel,
  onSaved,
  onLater,
}: StepProps & { question: TrainingQuestion }) {
  const [state, action, pending] = useActionState(
    saveTrainingSetupAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  const leavingRef = useSaved(state, onSaved, onLater);

  return (
    <form action={action} className={styles.stepForm} data-training={question}>
      {onSaved && state.status === "saved" ? null : (
        <ProfileNotice state={state} />
      )}
      <input name="part" type="hidden" value={question} />
      <TrainingFields question={question} paged training={training} />
      <div className={styles.stepActions}>
        {onLater ? (
          <LaterButton leavingRef={leavingRef} onLater={onLater} />
        ) : null}
        <button disabled={pending}>{submitLabel}</button>
      </div>
    </form>
  );
}

/** All four at once, on Settings. */
export function TrainingSetupForm({
  training,
}: {
  training: TrainingSetupView;
}) {
  const [state, action, pending] = useActionState(
    saveTrainingSetupAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  // Equipment is asked of those who train at home, here as in setup, and the
  // place is chosen in this same form, so the form follows it.
  const [atHome, setAtHome] = useState(() =>
    trainsAtHome(training.trainingPlaces),
  );

  return (
    <form action={action} className={styles.stepForm} data-training="all">
      <ProfileNotice state={state} />
      {(["frequency", "days", "places"] as const).map((question) => (
        <fieldset className={styles.sportGroup} key={question}>
          <legend>{TRAINING_QUESTIONS[question].heading}</legend>
          <input name="part" type="hidden" value={question} />
          <TrainingFields
            onPlaces={question === "places" ? setAtHome : undefined}
            question={question}
            training={training}
          />
        </fieldset>
      ))}
      {/* Not named as a part while Home is not a place, so what was saved
          for it is kept rather than cleared. */}
      {atHome ? (
        <fieldset className={styles.sportGroup}>
          <legend>{TRAINING_QUESTIONS.equipment.heading}</legend>
          <input name="part" type="hidden" value="equipment" />
          <TrainingFields question="equipment" training={training} />
        </fieldset>
      ) : null}
      <div className={styles.stepActions}>
        <button disabled={pending}>Save training setup</button>
      </div>
    </form>
  );
}

function TrainingFields({
  question,
  training,
  paged = false,
  onPlaces,
}: {
  question: TrainingQuestion;
  training: TrainingSetupView;
  /** Asked alone under its own heading, so the field's label is not shown. */
  paged?: boolean;
  onPlaces?: (atHome: boolean) => void;
}) {
  if (question === "frequency") {
    return (
      <MeasureInput
        initial={training.sessionsPerWeek}
        label="Sessions a week"
        name="sessionsPerWeek"
        range={SESSIONS_PER_WEEK_RANGE}
        start={3}
        step={1}
        unit="a week"
      />
    );
  }
  if (question === "days") {
    return <DaysFields paged={paged} training={training} />;
  }
  if (question === "places") {
    return (
      <NameChips
        addLabel="Add another place"
        groups={[{ label: null, names: TRAINING_PLACE_PRESETS }]}
        name="trainingPlaces"
        onChange={
          onPlaces ? (names) => onPlaces(trainsAtHome(names)) : undefined
        }
        placeholder="A place that is not listed"
        saved={training.trainingPlaces}
      />
    );
  }
  return (
    <NameChips
      addLabel="Add your own"
      groups={HOME_EQUIPMENT_PRESET_GROUPS.map(({ label, items }) => ({
        label,
        names: items,
      }))}
      name="homeEquipment"
      placeholder="Something that is not listed"
      saved={training.homeEquipment}
    />
  );
}

/**
 * Held in state rather than left to the form: React puts a form's own fields
 * back to what they started as once its action has run, which on Settings
 * would show the days as they were before the save.
 */
function DaysFields({
  training,
  paged,
}: {
  training: TrainingSetupView;
  paged: boolean;
}) {
  const [out, setOut] = useState<ReadonlySet<string>>(
    () => new Set(training.unavailableDays),
  );
  const [note, setNote] = useState(training.availabilityNote ?? "");
  const toggle = (day: string) =>
    setOut((current) => {
      const next = new Set(current);
      if (!next.delete(day)) next.add(day);
      return next;
    });

  return (
    <>
      <div className={styles.chips} data-centred={paged ? "true" : undefined}>
        {WEEKDAYS.map((day) => (
          <label className={styles.chip} key={day}>
            <input
              checked={out.has(day)}
              name="unavailableDays"
              onChange={() => toggle(day)}
              type="checkbox"
              value={day}
            />
            <span>{WEEKDAY_LABELS[day]}</span>
          </label>
        ))}
      </div>
      <label>
        Anything else about your week (optional)
        <textarea
          maxLength={AVAILABILITY_NOTE_MAX_LENGTH}
          name="availabilityNote"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Mondays only after 18:00"
          rows={2}
          value={note}
        />
      </label>
    </>
  );
}

/**
 * Names to tick, with a field that adds one of the owner's own under them:
 * the sports list's pattern, for places and for equipment. What is ticked is
 * sent under `name`, once each.
 */
function NameChips({
  name,
  groups,
  saved,
  addLabel,
  placeholder,
  onChange,
}: {
  name: string;
  groups: readonly { label: string | null; names: readonly string[] }[];
  saved: string[];
  addLabel: string;
  placeholder: string;
  onChange?: (chosen: string[]) => void;
}) {
  const presets = groups.flatMap((group) => group.names);
  const isPreset = (value: string) =>
    presets.some(
      (preset) => preset.toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
  const [own, setOwn] = useState(() =>
    saved.filter((value) => !isPreset(value)),
  );
  const [chosen, setChosen] = useState(
    () => new Set(saved.map((value) => value.toLocaleLowerCase())),
  );
  const [typed, setTyped] = useState("");

  const choose = (next: Set<string>, all: readonly string[] = own) => {
    setChosen(next);
    onChange?.(
      [...presets, ...all].filter((value) =>
        next.has(value.toLocaleLowerCase()),
      ),
    );
  };
  const toggle = (value: string) => {
    const next = new Set(chosen);
    const key = value.toLocaleLowerCase();
    if (!next.delete(key)) next.add(key);
    choose(next);
  };
  const add = () => {
    const value = typed.trim().replace(/\s+/g, " ");
    if (value === "") return;
    const key = value.toLocaleLowerCase();
    const known =
      isPreset(value) || own.some((item) => item.toLocaleLowerCase() === key);
    const all = known ? own : [...own, value];
    if (!known) setOwn(all);
    choose(new Set(chosen).add(key), all);
    setTyped("");
  };

  const chips = (names: readonly string[]) => (
    <div className={styles.chips}>
      {names.map((value) => (
        <label className={styles.chip} key={value}>
          <input
            checked={chosen.has(value.toLocaleLowerCase())}
            name={name}
            onChange={() => toggle(value)}
            type="checkbox"
            value={value}
          />
          <span>{value}</span>
        </label>
      ))}
    </div>
  );

  return (
    <>
      {groups.map(({ label, names }) =>
        label === null ? (
          <div key="all">{chips(names)}</div>
        ) : (
          <fieldset className={styles.sportGroup} key={label}>
            <legend>{label}</legend>
            {chips(names)}
          </fieldset>
        ),
      )}
      {own.length ? (
        <fieldset className={styles.sportGroup}>
          <legend>Your own</legend>
          {chips(own)}
        </fieldset>
      ) : null}
      <div className={styles.addSport}>
        <label>
          {addLabel}
          <input
            maxLength={TRAINING_NAME_MAX_LENGTH}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the name; it must not send the whole form.
              if (event.key !== "Enter") return;
              event.preventDefault();
              add();
            }}
            placeholder={placeholder}
            value={typed}
          />
        </label>
        <button className={styles.secondaryButton} onClick={add} type="button">
          Add
        </button>
      </div>
    </>
  );
}
