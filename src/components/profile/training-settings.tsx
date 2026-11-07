"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { INITIAL_PROFILE_ACTION_STATE } from "@/app/home/you/profile-action-state";
import { saveTrainingSetupAction } from "@/app/home/you/profile-actions";
import {
  AVAILABILITY_NOTE_MAX_LENGTH,
  HOME_EQUIPMENT_MAX_COUNT,
  HOME_EQUIPMENT_PRESET_GROUPS,
  SESSIONS_PER_WEEK_RANGE,
  TRAINING_NAME_MAX_LENGTH,
  TRAINING_PLACE_PRESETS,
  TRAINING_PLACES_MAX_COUNT,
  WEEKDAY_LABELS,
  WEEKDAYS,
  trainsAtHome,
  type TrainingSetupView,
  type Weekday,
} from "@/lib/training/training-setup";
import styles from "./training-settings.module.css";

type Part = "frequency" | "days" | "places" | "equipment";
type PartState = "saving" | "saved" | "refused" | undefined;
type Save = (part: Part, fill: (form: FormData) => void) => Promise<boolean>;

/**
 * Training setup in Settings (owner, 6 Nov 2026): each part saves itself the
 * moment it changes, with no Save at the end; the days are a strip of
 * weekdays to tap; and places and equipment are the owner's own short lists,
 * the catalogue shown only while adding, as the sports list does. Guided
 * setup still asks each part on a screen of its own (`training-forms.tsx`).
 *
 * Each save sends one part, which is all `parseTrainingSetup` reads, so a
 * slow save of one cannot write back an older state of another. Two saves of
 * the same part reach the server in the order sent, because Next runs a
 * page's Server Actions one at a time; only the latest one's answer is shown.
 * A change still waiting (the stepper's taps, a note being typed) is sent as
 * the page is left, so leaving never loses it.
 */
export function TrainingSettings({
  training,
}: {
  training: TrainingSetupView;
}) {
  const [states, setStates] = useState<Partial<Record<Part, PartState>>>({});
  // Why the latest refused part was refused; another part's success leaves it.
  const [notice, setNotice] = useState<{ part: Part; message: string } | null>(
    null,
  );
  const latest = useRef<Partial<Record<Part, number>>>({});

  const save: Save = (part, fill) => {
    const form = new FormData();
    form.set("part", part);
    fill(form);
    const ticket = (latest.current[part] ?? 0) + 1;
    latest.current[part] = ticket;
    setStates((current) => ({ ...current, [part]: "saving" }));
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await saveTrainingSetupAction(
          INITIAL_PROFILE_ACTION_STATE,
          form,
        ).catch(() => null);
        const saved = result?.status === "saved";
        resolve(saved);
        // A newer save of this part has the last word.
        if (latest.current[part] !== ticket) return;
        setStates((current) => ({
          ...current,
          [part]: saved ? "saved" : "refused",
        }));
        setNotice((current) =>
          saved
            ? current?.part === part
              ? null
              : current
            : {
                part,
                message:
                  result?.message ??
                  "Your training setup could not be saved. Reload and try again.",
              },
        );
      });
    });
  };

  const [places, setPlaces] = useState(training.trainingPlaces);
  // Shown for this visit once it was, so removing the last piece of
  // equipment does not take the field to add one away with it.
  const [hadEquipment] = useState(training.homeEquipment.length > 0);

  return (
    <div className={styles.parts}>
      {notice === null ? null : (
        <p className={styles.notice} role="alert">
          {notice.message}
        </p>
      )}
      <Frequency
        initial={training.sessionsPerWeek}
        onSave={(value) =>
          save("frequency", (form) =>
            form.set("sessionsPerWeek", value === null ? "" : String(value)),
          )
        }
        state={states.frequency}
      />
      <Days
        initialDays={training.unavailableDays}
        initialNote={training.availabilityNote ?? ""}
        onSave={(days, note) =>
          save("days", (form) => {
            for (const day of days) form.append("unavailableDays", day);
            form.set("availabilityNote", note);
          })
        }
        state={states.days}
      />
      <OwnList
        addLabel="Add a place"
        heading="Where you train"
        max={TRAINING_PLACES_MAX_COUNT}
        onSave={(names) => {
          setPlaces(names);
          save("places", (form) => {
            for (const name of names) form.append("trainingPlaces", name);
          });
        }}
        placeholder="e.g. Gym"
        saved={training.trainingPlaces}
        state={states.places}
        suggestions={TRAINING_PLACE_PRESETS}
      />
      {/* Asked of those who train at home, and shown to anyone with
          equipment saved: the coach reads it whatever the places are called
          ("Zuhause" is no "Home"), so it is never out of sight here. */}
      {trainsAtHome(places) || hadEquipment ? (
        <OwnList
          addLabel="Add equipment"
          heading="What you have at home"
          max={HOME_EQUIPMENT_MAX_COUNT}
          onSave={(names) =>
            save("equipment", (form) => {
              for (const name of names) form.append("homeEquipment", name);
            })
          }
          placeholder="e.g. Dumbbells"
          saved={training.homeEquipment}
          state={states.equipment}
          suggestions={HOME_EQUIPMENT_PRESET_GROUPS.flatMap(
            (group) => group.items,
          )}
        />
      ) : null}
    </div>
  );
}

/**
 * Beside a part's heading: "Saved" once its last change is stored, "Not
 * saved" when it was refused, which the notice above says why.
 */
function Saved({ state }: { state: PartState }) {
  return (
    <span
      className={styles.saved}
      data-refused={state === "refused" || undefined}
      role="status"
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : state === "refused"
            ? "Not saved"
            : ""}
    </span>
  );
}

function Frequency({
  initial,
  state,
  onSave,
}: {
  initial: number | null;
  state: PartState;
  onSave: (value: number | null) => void;
}) {
  const [value, setValue] = useState(initial);
  // A run of taps is one save, of where they stopped; one still waiting is
  // sent when the page is left.
  const send = useDebouncedSend(500, onSave);
  const step = (by: 1 | -1) => {
    const { min, max } = SESSIONS_PER_WEEK_RANGE;
    const next = value === null ? 3 : Math.min(max, Math.max(min, value + by));
    if (next === value) return;
    setValue(next);
    send(next);
  };
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.part}>
      <div className={styles.partHead}>
        <h2 id={headingId}>Sessions a week</h2>
        <Saved state={state} />
      </div>
      <div className={styles.stepper}>
        <button
          aria-label="One session fewer"
          disabled={value !== null && value <= SESSIONS_PER_WEEK_RANGE.min}
          onClick={() => step(-1)}
          type="button"
        >
          −
        </button>
        <output aria-live="polite">
          {value === null ? "Not set" : `${value} a week`}
        </output>
        <button
          aria-label="One session more"
          disabled={value !== null && value >= SESSIONS_PER_WEEK_RANGE.max}
          onClick={() => step(1)}
          type="button"
        >
          +
        </button>
      </div>
    </section>
  );
}

function Days({
  initialDays,
  initialNote,
  state,
  onSave,
}: {
  initialDays: Weekday[];
  initialNote: string;
  state: PartState;
  onSave: (days: Weekday[], note: string) => void;
}) {
  const [out, setOut] = useState<ReadonlySet<Weekday>>(
    () => new Set(initialDays),
  );
  const [note, setNote] = useState(initialNote);
  const headingId = useId();
  const noteId = useId();
  // The days and the note are one part. A tap sends both at once; typing
  // sends them once the owner pauses, and on leaving the field or the page.
  const send = useDebouncedSend(
    800,
    (next: { days: Weekday[]; note: string }) => onSave(next.days, next.note),
  );
  const days = (set: ReadonlySet<Weekday>) =>
    WEEKDAYS.filter((weekday) => set.has(weekday));

  const toggle = (day: Weekday) => {
    const next = new Set(out);
    if (!next.delete(day)) next.add(day);
    setOut(next);
    send({ days: days(next), note }, { now: true });
  };

  return (
    <section aria-labelledby={headingId} className={styles.part}>
      <div className={styles.partHead}>
        <h2 id={headingId}>Days you can&rsquo;t train</h2>
        <Saved state={state} />
      </div>
      <div className={styles.week} role="group" aria-labelledby={headingId}>
        {WEEKDAYS.map((day) => (
          <button
            aria-label={WEEKDAY_LABELS[day]}
            aria-pressed={out.has(day)}
            className={styles.day}
            key={day}
            onClick={() => toggle(day)}
            type="button"
          >
            {WEEKDAY_LABELS[day].slice(0, 2)}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        Tap the days that are out. Every other day counts as free.
      </p>
      <label className={styles.noteLabel} htmlFor={noteId}>
        Anything else about your week (optional)
      </label>
      <textarea
        className={styles.note}
        id={noteId}
        maxLength={AVAILABILITY_NOTE_MAX_LENGTH}
        onBlur={() => send.flush()}
        onChange={(event) => {
          setNote(event.target.value);
          send({ days: days(out), note: event.target.value });
        }}
        placeholder="Mondays only after 18:00"
        rows={2}
        value={note}
      />
    </section>
  );
}

/**
 * The owner's own names, each removable, and a field that adds one: the
 * catalogue appears as suggestions only while adding, narrowed by what is
 * typed, and never lists what is already chosen.
 */
function OwnList({
  heading,
  saved,
  suggestions,
  addLabel,
  placeholder,
  max,
  state,
  onSave,
}: {
  heading: string;
  saved: string[];
  suggestions: readonly string[];
  addLabel: string;
  placeholder: string;
  max: number;
  state: PartState;
  onSave: (names: string[]) => void;
}) {
  const [names, setNames] = useState(saved);
  const [typed, setTyped] = useState("");
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const headingId = useId();
  const fieldId = useId();

  const key = (name: string) => name.trim().toLocaleLowerCase();
  const has = (name: string) => names.some((own) => key(own) === key(name));
  const change = (next: string[]) => {
    setNames(next);
    onSave(next);
  };
  const add = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name === "") return;
    // Said rather than silently ignored.
    if (has(name)) return setRefusal(`${name} is already in your list.`);
    if (names.length >= max) return setRefusal(`Up to ${max} here.`);
    if (name.length > TRAINING_NAME_MAX_LENGTH) {
      return setRefusal(`Up to ${TRAINING_NAME_MAX_LENGTH} characters.`);
    }
    setRefusal(null);
    change([...names, name]);
    setTyped("");
  };
  const offered = suggestions.filter(
    (name) => !has(name) && key(name).includes(key(typed)),
  );

  return (
    <section aria-labelledby={headingId} className={styles.part}>
      <div className={styles.partHead}>
        <h2 id={headingId}>{heading}</h2>
        <Saved state={state} />
      </div>
      {names.length === 0 ? (
        <p className={styles.hint}>None yet.</p>
      ) : (
        <ul aria-labelledby={headingId} className={styles.own}>
          {names.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button
                aria-label={`Remove ${name}`}
                className={styles.remove}
                onClick={() => change(names.filter((own) => own !== name))}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={styles.add}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          add(typed);
        }}
      >
        <label className={styles.noteLabel} htmlFor={fieldId}>
          {addLabel}
        </label>
        <div className={styles.addLine}>
          <input
            id={fieldId}
            maxLength={TRAINING_NAME_MAX_LENGTH}
            onChange={(event) => setTyped(event.target.value)}
            onFocus={() => setAdding(true)}
            placeholder={placeholder}
            value={typed}
          />
          <button className={styles.addButton} type="submit">
            Add
          </button>
        </div>
        {refusal === null ? null : (
          <p className={styles.hint} role="alert">
            {refusal}
          </p>
        )}
        {adding && offered.length > 0 ? (
          <div
            aria-label={`Suggestions for ${heading.toLowerCase()}`}
            className={styles.suggestions}
            role="group"
          >
            {offered.map((name) => (
              <button
                className={styles.suggestion}
                key={name}
                onClick={() => add(name)}
                type="button"
              >
                + {name}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </section>
  );
}

/**
 * Sends the latest value once the owner pauses for `delay` ms, or at once
 * with `now`. One still waiting is sent on `flush()`, when the component
 * leaves the page, and when the page itself is hidden or closed.
 */
function useDebouncedSend<T>(delay: number, sendValue: (value: T) => void) {
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSend = useRef(sendValue);
  useEffect(() => {
    latestSend.current = sendValue;
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const waiting = pending.current;
    pending.current = null;
    if (waiting) latestSend.current(waiting.value);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const send = (value: T, options?: { now?: boolean }) => {
    pending.current = { value };
    if (timer.current) clearTimeout(timer.current);
    if (options?.now) flush();
    else timer.current = setTimeout(flush, delay);
  };
  send.flush = flush;
  return send;
}
