"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import styles from "@/app/home/you/onboarding/onboarding.module.css";
import {
  INITIAL_PROFILE_ACTION_STATE,
  type ProfileActionState,
} from "@/app/home/you/profile-action-state";
import {
  deleteWeightEntryAction,
  saveAppSettingsAction,
  saveProfileDetailsAction,
  saveProfileSportsAction,
} from "@/app/home/you/profile-actions";
import { formatRoadmapDate } from "@/components/roadmap/roadmap-dates";
import {
  cmToFeetAndInches,
  kgToPounds,
  unitsForLocale,
  type UnitsSystem,
} from "@/lib/profile/body-measures";
import {
  GENDER_LABELS,
  GENDERS,
  type ProfileDetailsView,
  type WeightEntryView,
} from "@/lib/profile/profile-contract";
import {
  isPresetSport,
  SPORT_NAME_MAX_LENGTH,
  SPORT_PRESET_GROUPS,
} from "@/lib/sports/sport-presets";

/**
 * "About you" and "Your sports" (owner, 5 Oct 2026). They are the first two
 * steps of guided setup and the forms on Settings, and in both places they
 * save straight to the profile: what is typed here is the owner's own, so
 * there is no draft and nothing to review.
 */

function ProfileNotice({ state }: { state: ProfileActionState }) {
  if (state.status === "idle" || state.message === "") return null;
  return (
    <div
      className={styles.notice}
      data-profile-notice
      data-state={state.status}
      role={state.status === "saved" ? "status" : "alert"}
    >
      {state.message}
    </div>
  );
}

/**
 * Runs once for each save that went through: `onLater` when the save was made
 * to leave ("Continue later"), `onSaved` otherwise. In an effect, because both
 * change what a parent shows, and a parent is not to be updated while its
 * child renders. A save that was refused stays where it is, with its notice.
 */
function useSaved(
  state: ProfileActionState,
  onSaved?: () => void,
  onLater?: () => void,
) {
  const handled = useRef(state.submission);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (handled.current === state.submission) return;
    handled.current = state.submission;
    const left = leavingRef.current;
    leavingRef.current = false;
    if (state.status !== "saved") return;
    if (left) onLater?.();
    else onSaved?.();
  });
  return leavingRef;
}

/**
 * "Continue later" in guided setup (owner, 5 Oct 2026): a link under a step's
 * buttons that does not leave at once. It first says what setup is for and
 * asks again; `children` is the button that then really leaves, which each
 * step supplies because each saves in its own way.
 */
export function ContinueLater({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        className={styles.laterLink}
        onClick={() => setAsking(true)}
        type="button"
      >
        Continue later
      </button>
    );
  }

  // A popup over the step (owner, 5 Oct 2026). It is drawn from inside the
  // step's form, where `children` has to be to send that form, and laid over
  // the whole screen; Escape and a press beside it both go back to the step.
  return (
    <div
      className={styles.leaveBackdrop}
      data-leave-setup
      onClick={() => setAsking(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setAsking(false);
      }}
    >
      <div
        aria-describedby="leave-setup-why"
        aria-labelledby="leave-setup-title"
        aria-modal="true"
        className={styles.leavePanel}
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <strong id="leave-setup-title">Setup makes FitTip useful</strong>
        <p id="leave-setup-why">
          Your coach and your plan work from what you tell us here. Without it
          they have little to go on. You can pick it up again from You.
        </p>
        <div>
          <button autoFocus onClick={() => setAsking(false)} type="button">
            Keep going
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The button that leaves a profile step once the owner has confirmed: it
 * saves what the step holds and goes to the app. `canSave` is false when the
 * step has nothing it could save yet, and then it only leaves.
 */
function LaterButton({
  leavingRef,
  onLater,
  canSave = () => true,
}: {
  leavingRef: { current: boolean };
  onLater: () => void;
  canSave?: (form: HTMLFormElement) => boolean;
}) {
  return (
    <ContinueLater>
      <button
        className={styles.secondaryButton}
        onClick={(event) => {
          const form = event.currentTarget.form;
          if (!form || !canSave(form)) {
            onLater();
            return;
          }
          leavingRef.current = true;
          form.requestSubmit();
        }}
        type="button"
      >
        Continue later
      </button>
    </ContinueLater>
  );
}

/**
 * "About you" one question at a time, as guided setup asks it (owner, 5 Oct
 * 2026): the heading each question is asked under, in order. Only the first
 * must be answered.
 */
export const ABOUT_YOU_QUESTIONS = [
  "What's your name?",
  "When is your birthday?",
  "What's your gender?",
  "How tall are you?",
  "How much do you weigh?",
] as const;

export function AboutYouForm({
  profile,
  submitLabel,
  question,
  onQuestion,
  onSaved,
  onLater,
}: {
  profile: ProfileDetailsView;
  submitLabel: string;
  /**
   * Setup shows one question, by its place in `ABOUT_YOU_QUESTIONS`, and
   * says which one it is on; each Next saves the form as it stands, so
   * nothing typed is lost by leaving. Without it this is Settings: every
   * field at once, saved by its one button.
   */
  question?: number;
  onQuestion?: (question: number) => void;
  /** Setup moves on; Settings stays and says it is saved. */
  onSaved?: () => void;
  /** Setup only: where "Continue later" goes once what is here is saved. */
  onLater?: () => void;
}) {
  const [state, action, pending] = useActionState(
    saveProfileDetailsAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  // Sent by hand rather than as the form's own action: React empties a
  // form's fields once its action has run, and these are saved question by
  // question while the owner may still go Back to one.
  const [sending, startSending] = useTransition();
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answers = new FormData(event.currentTarget);
    startSending(() => action(answers));
  };

  const paged = question !== undefined;
  const last = ABOUT_YOU_QUESTIONS.length - 1;
  const leavingRef = useSaved(
    state,
    // A saved question moves to the next one; the last moves setup on.
    () => {
      if (paged && question < last) onQuestion?.(question + 1);
      else onSaved?.();
    },
    onLater,
  );

  // The units and the time zone are not asked (owner, 5 Oct 2026). Until the
  // profile has them they are the browser's: its language says the units,
  // and its own zone is sent once. Both are changed under App settings. The
  // server renders metric and no zone; the browser corrects that on its first
  // render, before anything is typed.
  const units = useUnits(profile);
  const browserZone = useSyncExternalStore(
    subscribeNothing,
    readBrowserZone,
    () => null,
  );
  const height =
    profile.heightCm === null ? null : cmToFeetAndInches(profile.heightCm);

  // A question asked on its own is named by its heading, so its one field
  // shows no label over it (owner, 5 Oct 2026); the label is still there for
  // a screen reader. Settings shows every field at once, each with its label.
  const name = (text: string) =>
    paged ? <span className={styles.srOnly}>{text}</span> : text;

  // Keyed by the units: once the browser has said which, the measures are
  // shown in that system from the start.
  const fields = [
    <label key="name">
      {name("Name")}
      <input
        autoComplete="name"
        defaultValue={profile.displayName ?? ""}
        maxLength={80}
        name="displayName"
        required
      />
    </label>,
    <label key="birthday">
      {name("Birthday (optional)")}
      <input
        defaultValue={profile.birthDate ?? ""}
        min="1900-01-01"
        name="birthDate"
        type="date"
      />
    </label>,
    <label key="gender">
      {name("Gender (optional)")}
      <select defaultValue={profile.gender ?? ""} name="gender">
        <option value="">Not set</option>
        {GENDERS.map((gender) => (
          <option key={gender} value={gender}>
            {GENDER_LABELS[gender]}
          </option>
        ))}
      </select>
    </label>,
    units === "metric" ? (
      <label key="height-metric">
        {name("Height in cm (optional)")}
        <input
          defaultValue={profile.heightCm ?? ""}
          inputMode="decimal"
          name="heightCm"
          placeholder={paged ? "cm" : undefined}
        />
      </label>
    ) : (
      // Two fields, so each keeps a word saying which it is.
      <div className={styles.fieldGrid} key="height-imperial">
        <label>
          {paged ? "Feet" : "Height, feet (optional)"}
          <input
            defaultValue={height?.feet ?? ""}
            inputMode="numeric"
            name="heightFeet"
          />
        </label>
        <label>
          Inches
          <input
            defaultValue={height?.inches ?? ""}
            inputMode="decimal"
            name="heightInches"
          />
        </label>
      </div>
    ),
    units === "metric" ? (
      <label key="weight-metric">
        {name("Weight in kg (optional)")}
        <input
          defaultValue={profile.latestWeightKg ?? ""}
          inputMode="decimal"
          name="weightKg"
          placeholder={paged ? "kg" : undefined}
        />
      </label>
    ) : (
      <label key="weight-imperial">
        {name("Weight in lb (optional)")}
        <input
          defaultValue={
            profile.latestWeightKg === null
              ? ""
              : kgToPounds(profile.latestWeightKg)
          }
          inputMode="decimal"
          name="weightLb"
          placeholder={paged ? "lb" : undefined}
        />
      </label>
    ),
  ];

  return (
    <form className={styles.stepForm} data-about-you onSubmit={send}>
      {/* Setup has a notice of its own, and there a save moves to the next
          step; without `onSaved` this is Settings, which stays and says so. */}
      {onSaved && state.status === "saved" ? null : (
        <ProfileNotice state={state} />
      )}
      <input name="unitsSystem" type="hidden" value={units} />
      <input
        name="timezoneName"
        type="hidden"
        value={profile.timezoneName ? "" : (browserZone ?? "")}
      />
      {paged ? (
        // Every field stays in the form, so one save sends them all; the
        // questions not being asked are only out of sight.
        fields.map((field, index) => (
          <div
            className={styles.question}
            hidden={index !== question}
            key={field.key}
          >
            {field}
            {/* Beside the field, not inside its label, whose name it would
                otherwise become part of. */}
            {index > 0 ? (
              <small>Optional. Leave it empty to skip it.</small>
            ) : null}
          </div>
        ))
      ) : (
        <>
          {fields[0]}
          <div className={styles.fieldGrid}>
            {fields[1]}
            {fields[2]}
          </div>
          {fields[3]}
          {fields[4]}
        </>
      )}
      <div className={styles.stepActions}>
        {paged && question > 0 ? (
          <button
            className={styles.secondaryButton}
            onClick={() => onQuestion?.(question - 1)}
            type="button"
          >
            Back
          </button>
        ) : null}
        {onLater ? (
          <LaterButton
            // Without a name there is nothing to save yet.
            canSave={(form) => {
              const name = form.elements.namedItem("displayName");
              return (
                name instanceof HTMLInputElement && name.value.trim() !== ""
              );
            }}
            leavingRef={leavingRef}
            onLater={onLater}
          />
        ) : null}
        <button disabled={pending || sending}>
          {paged && question < last ? "Next" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * The units and the time zone, on Settings. They are the app's settings
 * rather than something about the owner, so setup sets them from the browser
 * without asking and this is where they are changed.
 */
export function AppSettingsForm({ profile }: { profile: ProfileDetailsView }) {
  const [state, action, pending] = useActionState(
    saveAppSettingsAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  const suggested = useUnits(profile);
  const [chosenUnits, setChosenUnits] = useState<UnitsSystem | null>(null);

  return (
    <form action={action} className={styles.stepForm} data-app-settings>
      <ProfileNotice state={state} />
      <div className={styles.fieldGrid}>
        <label>
          Units
          <select
            name="unitsSystem"
            onChange={(event) =>
              setChosenUnits(event.target.value as UnitsSystem)
            }
            value={chosenUnits ?? suggested}
          >
            <option value="metric">Metric (cm, kg)</option>
            <option value="imperial">Imperial (ft, lb)</option>
          </select>
        </label>
        <label>
          Time zone
          <TimezoneSelect saved={profile.timezoneName} />
        </label>
      </div>
      <div className={styles.stepActions}>
        <button disabled={pending}>Save settings</button>
      </div>
    </form>
  );
}

/** The profile's units, or the ones the browser's language suggests. */
function useUnits(profile: ProfileDetailsView): UnitsSystem {
  const suggested = useSyncExternalStore(
    subscribeNothing,
    readSuggestedUnits,
    () => "metric" as const,
  );
  return profile.unitsSystem ?? suggested;
}

export function SportsForm({
  sports,
  submitLabel,
  onSaved,
  onBack,
  onLater,
}: {
  sports: string[];
  submitLabel: string;
  onSaved?: () => void;
  onBack?: () => void;
  /** Setup only: where "Continue later" goes once the sports are saved. */
  onLater?: () => void;
}) {
  const [state, action, pending] = useActionState(
    saveProfileSportsAction,
    INITIAL_PROFILE_ACTION_STATE,
  );
  const leavingRef = useSaved(state, onSaved, onLater);

  // The owner's own sports: the saved ones that are no preset, then whatever
  // they add here. A preset is recognised however it was typed.
  const [own, setOwn] = useState(() =>
    sports.filter((sport) => !isPresetSport(sport)),
  );
  const [chosen, setChosen] = useState(
    () => new Set(sports.map((sport) => sport.toLocaleLowerCase())),
  );
  const [typed, setTyped] = useState("");

  const toggle = (sport: string) =>
    setChosen((current) => {
      const next = new Set(current);
      const key = sport.toLocaleLowerCase();
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const add = () => {
    const name = typed.trim().replace(/\s+/g, " ");
    // A comma separates sports where they are still typed as a list.
    if (name === "" || name.includes(",")) return;
    const key = name.toLocaleLowerCase();
    if (
      !isPresetSport(name) &&
      !own.some((sport) => sport.toLocaleLowerCase() === key)
    ) {
      setOwn((current) => [...current, name]);
    }
    setChosen((current) => new Set(current).add(key));
    setTyped("");
  };

  const group = (label: string, names: readonly string[]) =>
    names.length ? (
      <fieldset className={styles.sportGroup} key={label}>
        <legend>{label}</legend>
        <div className={styles.chips}>
          {names.map((sport) => (
            <label className={styles.chip} key={sport}>
              <input
                checked={chosen.has(sport.toLocaleLowerCase())}
                name="sports"
                onChange={() => toggle(sport)}
                type="checkbox"
                value={sport}
              />
              <span>{sport}</span>
            </label>
          ))}
        </div>
      </fieldset>
    ) : null;

  return (
    <form action={action} className={styles.stepForm} data-sports>
      {onSaved && state.status === "saved" ? null : (
        <ProfileNotice state={state} />
      )}
      {group("Your own", own)}
      <div className={styles.addSport}>
        <label>
          Add your own
          <input
            maxLength={SPORT_NAME_MAX_LENGTH}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the sport; it must not send the whole form.
              if (event.key !== "Enter") return;
              event.preventDefault();
              add();
            }}
            placeholder="A sport that is not listed"
            value={typed}
          />
        </label>
        <button className={styles.secondaryButton} onClick={add} type="button">
          Add
        </button>
      </div>
      {SPORT_PRESET_GROUPS.map(({ label, sports: names }) =>
        group(label, names),
      )}
      <div className={styles.stepActions}>
        {onBack ? (
          <button
            className={styles.secondaryButton}
            onClick={onBack}
            type="button"
          >
            Back
          </button>
        ) : null}
        {onLater ? (
          <LaterButton leavingRef={leavingRef} onLater={onLater} />
        ) : null}
        <button disabled={pending}>{submitLabel}</button>
      </div>
    </form>
  );
}

export function WeightHistory({
  entries,
  unitsSystem,
}: {
  entries: WeightEntryView[];
  unitsSystem: UnitsSystem;
}) {
  const [state, action, pending] = useActionState(
    deleteWeightEntryAction,
    INITIAL_PROFILE_ACTION_STATE,
  );

  if (entries.length === 0) {
    return (
      <p className={styles.explainer}>
        No weight recorded yet. A weight saved above is kept here with its day.
      </p>
    );
  }

  return (
    <>
      <ProfileNotice state={state} />
      <ul className={styles.weightList}>
        {entries.map((entry) => (
          <li key={entry.measuredOn}>
            <span>{formatRoadmapDate(entry.measuredOn)}</span>
            <strong>
              {unitsSystem === "metric"
                ? `${entry.weightKg} kg`
                : `${kgToPounds(entry.weightKg)} lb`}
            </strong>
            <form action={action}>
              <input name="measuredOn" type="hidden" value={entry.measuredOn} />
              <button
                aria-label={`Remove the weight of ${formatRoadmapDate(entry.measuredOn)}`}
                className={styles.secondaryButton}
                disabled={pending}
              >
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
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
  // out UTC, which is what a profile with no zone starts from.
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

function readSuggestedUnits(): UnitsSystem {
  try {
    return unitsForLocale(navigator.language);
  } catch {
    return "metric";
  }
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
