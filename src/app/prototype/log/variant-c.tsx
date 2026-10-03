"use client";

/**
 * PROTOTYPE — C: a conversation. The questions arrive one under another on
 * one page; each answer folds into a line you can tap to change, so what you
 * said stays in sight while the next question appears. Same rules as B: a
 * skip asks nothing about training, and "Anything off?" is always answered.
 */

import { useState } from "react";

import {
  FEELINGS,
  OUTCOMES,
  SAFETY_NOTICE,
  SESSION,
  SIGNALS,
  SessionHead,
  StatePanel,
  trained,
  useDraft,
  type Draft,
  type Signal,
} from "./shared";
import styles from "./prototype-log.module.css";

export const name = "Conversation";

type Key = "outcome" | "minutes" | "effort" | "feeling" | "off" | "note";

function keysFor(draft: Draft): Key[] {
  return trained(draft)
    ? ["outcome", "minutes", "effort", "feeling", "off", "note"]
    : ["outcome", "off", "note"];
}

const QUESTIONS: Record<Key, string> = {
  outcome: "How did it go?",
  minutes: "How long did you train?",
  effort: "How hard was it, 1 to 10?",
  feeling: "How did it feel?",
  off: "Anything off?",
  note: "Anything to add?",
};

export function VariantC() {
  const [draft, setDraft] = useDraft();
  const [answered, setAnswered] = useState<Key[]>([]);
  const [editing, setEditing] = useState<Key | null>(null);
  const [saved, setSaved] = useState(false);
  const keys = keysFor(draft);
  const current = editing ?? keys.find((k) => !answered.includes(k)) ?? null;
  const signals = draft.signals ?? [];

  const answer = (key: Key, next: Draft) => {
    setDraft(next);
    setAnswered((list) => (list.includes(key) ? list : [...list, key]));
    setEditing(null);
  };

  const summary = (key: Key): string => {
    switch (key) {
      case "outcome":
        return OUTCOMES.find((o) => o.value === draft.outcome)?.label ?? "";
      case "minutes":
        return `${draft.minutes} min`;
      case "effort":
        return draft.effort === null ? "Not said" : `${draft.effort} of 10`;
      case "feeling":
        return (
          FEELINGS.find((f) => f.value === draft.feeling)?.label ?? "Not said"
        );
      case "off":
        return signals.length === 0
          ? "Nothing was off"
          : signals
              .map((s) => SIGNALS.find((x) => x.value === s)?.label)
              .join(", ");
      case "note":
        return draft.note === "" ? "Nothing" : draft.note;
    }
  };

  return (
    <main className={styles.page}>
      <SessionHead />
      <ul className={styles.planned}>
        {SESSION.activities.map((a) => (
          <li key={a.name}>
            <strong>{a.name}</strong> {a.target}
          </li>
        ))}
      </ul>

      <ol className={styles.thread}>
        {keys.map((key) => {
          const done = answered.includes(key) && current !== key;
          if (!done && current !== key) return null;
          return (
            <li key={key} className={styles.turn}>
              <p className={styles.ask}>{QUESTIONS[key]}</p>
              {done ? (
                <button
                  type="button"
                  className={styles.reply}
                  onClick={() => setEditing(key)}
                >
                  {summary(key)}
                  <span>Change</span>
                </button>
              ) : (
                <div className={styles.answerBox}>
                  {key === "outcome"
                    ? OUTCOMES.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={styles.chip}
                          data-selected={draft.outcome === o.value}
                          onClick={() =>
                            answer("outcome", { ...draft, outcome: o.value })
                          }
                        >
                          {o.label}
                        </button>
                      ))
                    : null}
                  {key === "minutes" ? (
                    <>
                      {[30, 40, SESSION.plannedMinutes, 50, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={styles.chip}
                          data-selected={draft.minutes === m}
                          onClick={() =>
                            answer("minutes", { ...draft, minutes: m })
                          }
                        >
                          {m}
                          {m === SESSION.plannedMinutes ? " (planned)" : ""}
                        </button>
                      ))}
                      <input
                        className={styles.chipInput}
                        type="number"
                        placeholder="Other"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            answer("minutes", {
                              ...draft,
                              minutes: Number(event.currentTarget.value),
                            });
                          }
                        }}
                      />
                    </>
                  ) : null}
                  {key === "effort" ? (
                    <>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={styles.dot}
                          data-selected={draft.effort === n}
                          onClick={() =>
                            answer("effort", { ...draft, effort: n })
                          }
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={styles.chipQuiet}
                        onClick={() =>
                          answer("effort", { ...draft, effort: null })
                        }
                      >
                        Rather not say
                      </button>
                    </>
                  ) : null}
                  {key === "feeling"
                    ? [...FEELINGS].reverse().map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          className={styles.chip}
                          data-selected={draft.feeling === f.value}
                          onClick={() =>
                            answer("feeling", { ...draft, feeling: f.value })
                          }
                        >
                          {f.label}
                        </button>
                      ))
                    : null}
                  {key === "off" ? (
                    <>
                      {SIGNALS.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          className={styles.chip}
                          data-selected={signals.includes(s.value)}
                          aria-pressed={signals.includes(s.value)}
                          onClick={() => {
                            const next: Signal[] = signals.includes(s.value)
                              ? signals.filter((x) => x !== s.value)
                              : [...signals, s.value];
                            setDraft({ ...draft, signals: next });
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                      {signals.length > 0 ? (
                        <>
                          <p className={styles.safety}>{SAFETY_NOTICE}</p>
                          <button
                            type="button"
                            className={styles.primary}
                            onClick={() => answer("off", draft)}
                          >
                            That&rsquo;s all
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() =>
                            answer("off", { ...draft, signals: [] })
                          }
                        >
                          Nothing was off
                        </button>
                      )}
                    </>
                  ) : null}
                  {key === "note" ? (
                    <>
                      <textarea
                        className={styles.bigNote}
                        rows={3}
                        placeholder="Optional"
                        value={draft.note}
                        onChange={(event) =>
                          setDraft({ ...draft, note: event.target.value })
                        }
                      />
                      <button
                        type="button"
                        className={styles.chipQuiet}
                        onClick={() => answer("note", draft)}
                      >
                        {draft.note === "" ? "Nothing to add" : "Done"}
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {current === null ? (
        <button
          type="button"
          className={styles.primary}
          onClick={() => setSaved(true)}
        >
          {saved ? "Saved" : "Save log"}
        </button>
      ) : null}

      <StatePanel draft={draft} saved={saved} />
    </main>
  );
}
