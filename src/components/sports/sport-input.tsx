"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { useOwnedSports, useRememberSports } from "./owned-sports";
import styles from "./sport-input.module.css";

import {
  keepsAsSport,
  SPORT_NAME_MAX_LENGTH,
} from "@/lib/sports/sport-presets";
import { suggestSports } from "@/lib/sports/sport-suggestions";

const NOT_KEPT = `Kept here only: a sport on your list has no comma and up to ${SPORT_NAME_MAX_LENGTH} characters.`;

type SportInputProps = {
  id: string;
  name?: string;
  required?: boolean;
  /** Held by the form, with `onChange`; left out, the field holds its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (sport: string) => void;
};

/**
 * A field for one sport (owner, 8 Oct 2026). It is typed as before, and from
 * the first letter the owner's sports that begin that way are offered under
 * it to tap. Nothing is offered for an empty field, so a long list is never
 * in the way, and nothing until the owner types, so a form opened on a saved
 * sport is not met with others. A sport that is not theirs yet is simply
 * typed; the save adds it to their sports.
 */
export function SportInput({
  id,
  name,
  required,
  value,
  defaultValue,
  onChange,
}: SportInputProps) {
  const sports = useOwnedSports();
  const [own, setOwn] = useState(defaultValue ?? "");
  // What the owner last typed here. A value the form put in the field
  // itself, or a sport just tapped, is not something to complete.
  const [typed, setTyped] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = value ?? own;
  const set = (sport: string) => {
    setOwn(sport);
    onChange?.(sport);
  };
  const offered = typed === shown ? suggestSports(sports, shown) : [];
  const hintId = useId();
  const notKept =
    shown.trim() !== "" && !keepsAsSport(shown) && !owns(sports, shown);
  useSentSports(field, () => [shown]);

  return (
    <div className={styles.wrap}>
      <input
        ref={field}
        id={id}
        name={name}
        type="text"
        required={required}
        maxLength={80}
        autoComplete="off"
        value={shown}
        aria-describedby={notKept ? hintId : undefined}
        onChange={(event) => {
          setTyped(event.target.value);
          set(event.target.value);
        }}
      />
      {notKept ? (
        <span className={styles.hint} id={hintId}>
          {NOT_KEPT}
        </span>
      ) : null}
      <SportChips
        offered={offered}
        onPick={(sport) => {
          setTyped(null);
          set(sport);
          field.current?.focus();
        }}
      />
    </div>
  );
}

/**
 * A goal's sports (owner, 8 Oct 2026): any number, each a chip that a tap
 * takes away again, and the same field under them to add one, typed or
 * tapped. What is still in the field when the form is sent counts as well,
 * so a sport typed and not yet added is not lost.
 */
export function SportsInput({
  id,
  name,
  defaultValue,
  required = true,
  sports: given,
}: {
  id: string;
  name: string;
  defaultValue: readonly string[];
  /** Whether the goal must name a sport; in setup an empty row need not. */
  required?: boolean;
  /**
   * The sports to offer, where the page has read them itself: setup saves
   * them one screen before it asks for a goal's.
   */
  sports?: readonly string[];
}) {
  const owned = useOwnedSports();
  const sports = given ?? owned;
  const [chosen, setChosen] = useState<readonly string[]>(defaultValue);
  const [typed, setTyped] = useState("");
  // Said to a screen reader as a chip comes or goes.
  const [announced, setAnnounced] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const has = (list: readonly string[], sport: string) =>
    list.some(
      (other) => other.toLocaleLowerCase() === sport.toLocaleLowerCase(),
    );
  const add = (names: readonly string[]) => {
    setChosen((current) =>
      names.reduce(
        (list, sport) => (has(list, sport) ? list : [...list, sport]),
        current,
      ),
    );
    setAnnounced(`Added ${names.join(", ")}`);
    setTyped("");
    field.current?.focus();
  };
  const pending = namesIn(typed).filter((sport) => !has(chosen, sport));
  const notKept = [...chosen, ...pending].filter(
    (sport) => !keepsAsSport(sport) && !owns(sports, sport),
  );
  useSentSports(field, () => [...chosen, ...pending]);

  return (
    <div className={styles.wrap}>
      {chosen.length > 0 ? (
        <div className={styles.chips}>
          {chosen.map((sport) => (
            <button
              aria-label={`Remove ${sport}`}
              className={styles.chip}
              data-chosen="true"
              key={sport}
              onClick={() => {
                setChosen((current) =>
                  current.filter((other) => other !== sport),
                );
                setAnnounced(`Removed ${sport}`);
                field.current?.focus();
              }}
              type="button"
            >
              {sport}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={field}
        id={id}
        type="text"
        // A goal names at least one sport; once it does, the field may be
        // left empty.
        required={required && chosen.length === 0}
        // Room for a list typed with commas, as this field once took it.
        maxLength={600}
        autoComplete="off"
        placeholder={chosen.length === 0 ? "Running" : "Add another sport"}
        aria-describedby={notKept.length > 0 ? hintId : undefined}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          // Enter adds the sport; it must not send the whole form. With
          // nothing typed it sends the form as it does anywhere else.
          if (event.key !== "Enter" || pending.length === 0) return;
          event.preventDefault();
          add(pending);
        }}
      />
      {notKept.length > 0 ? (
        <span className={styles.hint} id={hintId}>
          {NOT_KEPT}
        </span>
      ) : null}
      <SportChips
        offered={suggestSports(sports, typed, chosen)}
        onPick={(sport) => add([sport])}
      />
      {/* Not a status: a form's own notice is the page's status. */}
      <span className={styles.srOnly} aria-live="polite">
        {announced}
      </span>
      <input
        name={name}
        type="hidden"
        value={[...chosen, ...pending].join(", ")}
      />
    </div>
  );
}

function SportChips({
  offered,
  onPick,
}: {
  offered: readonly string[];
  onPick: (sport: string) => void;
}) {
  // Not named after the field: a group called "…sports" would answer to the
  // field's own label wherever a field is looked up by it. The count is said
  // as suggestions appear, which a screen reader otherwise would not know.
  return (
    <>
      {offered.length === 0 ? null : (
        <div aria-label="Suggestions" className={styles.chips} role="group">
          {offered.map((sport) => (
            <button
              className={styles.chip}
              key={sport}
              onClick={() => onPick(sport)}
              type="button"
            >
              {sport}
            </button>
          ))}
        </div>
      )}
      <span className={styles.srOnly} aria-live="polite">
        {offered.length === 0
          ? ""
          : offered.length === 1
            ? "1 sport suggested"
            : `${offered.length} sports suggested`}
      </span>
    </>
  );
}

function owns(sports: readonly string[], name: string) {
  const key = name.trim().toLocaleLowerCase();
  return sports.some((sport) => sport.toLocaleLowerCase() === key);
}

/**
 * Tells the owner's list, as the field's form is sent, which sports it
 * sends, so they are offered at once rather than from the next load.
 */
function useSentSports(
  field: RefObject<HTMLInputElement | null>,
  read: () => readonly string[],
) {
  const remember = useRememberSports();
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const sent = () => remember(latest.current());
    form.addEventListener("submit", sent);
    return () => form.removeEventListener("submit", sent);
  }, [field, remember]);
}

/** A comma separates sports where they are sent as a list. */
function namesIn(typed: string): string[] {
  return typed
    .split(",")
    .map((sport) => sport.trim())
    .filter((sport) => sport !== "");
}
