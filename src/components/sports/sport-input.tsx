"use client";

import { useRef, useState } from "react";

import { useOwnedSports } from "./owned-sports";
import styles from "./sport-input.module.css";

import { SPORT_NAME_MAX_LENGTH } from "@/lib/sports/sport-presets";
import { suggestSports } from "@/lib/sports/sport-suggestions";

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
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const shown = value ?? own;
  const set = (sport: string) => {
    setOwn(sport);
    onChange?.(sport);
  };
  const offered = typing ? suggestSports(sports, shown) : [];

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
        onChange={(event) => {
          setTyping(true);
          set(event.target.value);
        }}
      />
      <SportChips
        offered={offered}
        onPick={(sport) => {
          setTyping(false);
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
  const field = useRef<HTMLInputElement>(null);
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
    setTyped("");
    field.current?.focus();
  };
  const pending = namesIn(typed).filter((sport) => !has(chosen, sport));

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
        maxLength={SPORT_NAME_MAX_LENGTH * 2}
        autoComplete="off"
        placeholder={chosen.length === 0 ? "Running" : "Add another sport"}
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
      <SportChips
        offered={suggestSports(sports, typed, chosen)}
        onPick={(sport) => add([sport])}
      />
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
  if (offered.length === 0) return null;
  // Not named after the field: a group called "…sports" would answer to the
  // field's own label wherever a field is looked up by it.
  return (
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
  );
}

/** A comma separates sports where they are sent as a list. */
function namesIn(typed: string): string[] {
  return typed
    .split(",")
    .map((sport) => sport.trim())
    .filter((sport) => sport !== "");
}
