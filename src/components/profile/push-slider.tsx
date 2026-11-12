"use client";

import { useId, useState } from "react";

import {
  COACH_PUSH_LEVELS,
  type CoachPushLevel,
} from "@/lib/training/training-setup";
import styles from "./push-slider.module.css";

const FIRST = COACH_PUSH_LEVELS[0];
const LAST = COACH_PUSH_LEVELS[COACH_PUSH_LEVELS.length - 1];

/**
 * How hard the coach pushes (owner, 12 Nov 2026): a slider from the gentlest
 * level on the left to "All in" on the right, the chosen level's name and
 * what it means shown above it as it moves. The level's key is sent under
 * `name`, so a form saves it like any other field.
 */
export function PushSlider({
  initial,
  name = "pushLevel",
  label = "How hard your coach pushes you",
  onChange,
}: {
  initial: CoachPushLevel;
  name?: string;
  /** The slider's accessible name; the page's heading says it to the eye. */
  label?: string;
  onChange?: (level: CoachPushLevel) => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      COACH_PUSH_LEVELS.findIndex((level) => level.key === initial),
    ),
  );
  const level = COACH_PUSH_LEVELS[index];
  const describedBy = useId();

  return (
    <div className={styles.slider} data-push-slider>
      <div aria-live="polite" className={styles.chosen} id={describedBy}>
        <strong>{level.label}</strong>
        <span>{level.line}</span>
      </div>
      <input name={name} type="hidden" value={level.key} />
      <input
        aria-describedby={describedBy}
        aria-label={label}
        aria-valuetext={`${index + 1} of ${COACH_PUSH_LEVELS.length}: ${level.label}`}
        className={styles.range}
        max={COACH_PUSH_LEVELS.length}
        min={1}
        onChange={(event) => {
          const next = Number(event.target.value) - 1;
          setIndex(next);
          onChange?.(COACH_PUSH_LEVELS[next].key);
        }}
        step={1}
        type="range"
        value={index + 1}
      />
      <div aria-hidden="true" className={styles.ticks}>
        {COACH_PUSH_LEVELS.map((entry, at) => (
          <span data-reached={at <= index || undefined} key={entry.key} />
        ))}
      </div>
      <div aria-hidden="true" className={styles.ends}>
        <span>{FIRST.label}</span>
        <span>{LAST.label}</span>
      </div>
    </div>
  );
}
