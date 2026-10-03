"use client";

/**
 * PROTOTYPE — what the three log variants share: one example session, the
 * answers a log collects, and a panel showing what would be saved. Nothing
 * here is saved; the questions and their wording are the real form's
 * (`src/app/home/log/log-action-state.ts`).
 */

import { useState } from "react";

import styles from "./prototype-log.module.css";

export const SESSION = {
  title: "Tempo run",
  sport: "Running",
  date: "Sat 3 Oct",
  plannedMinutes: 45,
  activities: [
    { name: "Warm-up jog", target: "10 min easy" },
    { name: "Tempo", target: "3 × 8 min, 2 min jog between" },
    { name: "Cool-down", target: "10 min easy" },
  ],
};

export type Outcome =
  | "completed"
  | "partially_completed"
  | "skipped"
  | "replaced";
export type Feeling = "very_bad" | "bad" | "neutral" | "good" | "very_good";
export type Signal = "pain" | "illness" | "injury" | "severeFatigue";

export const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: "completed", label: "Completed", hint: "You did the session." },
  {
    value: "partially_completed",
    label: "Partly completed",
    hint: "You started it and did some of it.",
  },
  {
    value: "skipped",
    label: "Skipped",
    hint: "You did not do it. The planned session stays on the plan.",
  },
  {
    value: "replaced",
    label: "Replaced",
    hint: "You trained, but did something else instead.",
  },
];

export const FEELINGS: { value: Feeling; label: string }[] = [
  { value: "very_bad", label: "Very bad" },
  { value: "bad", label: "Bad" },
  { value: "neutral", label: "Neutral" },
  { value: "good", label: "Good" },
  { value: "very_good", label: "Very good" },
];

export const SIGNALS: { value: Signal; label: string }[] = [
  { value: "pain", label: "I felt pain" },
  { value: "illness", label: "I was ill" },
  { value: "injury", label: "I was injured" },
  { value: "severeFatigue", label: "I was severely fatigued" },
];

export const SAFETY_NOTICE =
  "If a symptom is severe, sudden or getting worse, stop training and speak to a qualified health professional. FitTip stores what you write here; it does not assess symptoms and gives no medical advice.";

export type Draft = {
  outcome: Outcome | null;
  minutes: number;
  effort: number | null;
  feeling: Feeling | null;
  activitiesAsPlanned: boolean | null;
  /** null until answered; [] means "nothing was off", said out loud. */
  signals: Signal[] | null;
  note: string;
};

export const EMPTY: Draft = {
  outcome: null,
  minutes: SESSION.plannedMinutes,
  effort: null,
  feeling: null,
  activitiesAsPlanned: null,
  signals: null,
  note: "",
};

/** A skip records no training, so it asks nothing about training. */
export function trained(draft: Draft) {
  return (
    draft.outcome === "completed" || draft.outcome === "partially_completed"
  );
}

export function useDraft() {
  return useState<Draft>(EMPTY);
}

/** Rule 5 of a prototype: show the whole state after every change. */
export function StatePanel({ draft, saved }: { draft: Draft; saved: boolean }) {
  return (
    <details className={styles.state} open={saved}>
      <summary>
        {saved ? "Saved (prototype — nothing written)" : "What would be saved"}
      </summary>
      <pre>{JSON.stringify(draft, null, 2)}</pre>
    </details>
  );
}

export function SessionHead() {
  return (
    <header className={styles.head}>
      <p className={styles.kicker}>
        {SESSION.date} · {SESSION.sport} · {SESSION.plannedMinutes} min planned
      </p>
      <h1>{SESSION.title}</h1>
    </header>
  );
}
