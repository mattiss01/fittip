"use client";

/**
 * PROTOTYPE — A: one form, as the log is today. Every question on one page,
 * in the order the real form asks them; the baseline the other two are
 * judged against.
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
  type Feeling,
  type Outcome,
  type Signal,
} from "./shared";
import styles from "./prototype-log.module.css";

export const name = "One form (today)";

export function VariantA() {
  const [draft, setDraft] = useDraft();
  const [saved, setSaved] = useState(false);
  const signals = draft.signals ?? [];

  const toggle = (signal: Signal) =>
    setDraft({
      ...draft,
      signals: signals.includes(signal)
        ? signals.filter((s) => s !== signal)
        : [...signals, signal],
    });

  return (
    <main className={styles.page}>
      <SessionHead />
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          setDraft({ ...draft, signals });
          setSaved(true);
        }}
      >
        <label className={styles.field}>
          <span>What happened</span>
          <select
            value={draft.outcome ?? ""}
            required
            onChange={(event) =>
              setDraft({ ...draft, outcome: event.target.value as Outcome })
            }
          >
            <option value="" disabled>
              Choose…
            </option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {trained(draft) || draft.outcome === null ? (
          <>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Duration (minutes)</span>
                <input
                  type="number"
                  value={draft.minutes}
                  onChange={(event) =>
                    setDraft({ ...draft, minutes: Number(event.target.value) })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Effort (1-10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.effort ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      effort:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className={styles.field}>
              <span>How it felt</span>
              <select
                value={draft.feeling ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    feeling: (event.target.value || null) as Feeling | null,
                  })
                }
              >
                <option value="">Not recorded</option>
                {FEELINGS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.field}>
              <span>Activities</span>
              <ul className={styles.activityList}>
                {SESSION.activities.map((a) => (
                  <li key={a.name}>
                    <strong>{a.name}</strong> {a.target}
                    <button type="button" className={styles.smallButton}>
                      Adjust
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <label className={styles.field}>
          <span>Note</span>
          <textarea
            rows={3}
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />
        </label>

        <fieldset className={styles.field}>
          <span>Anything off?</span>
          {SIGNALS.map((s) => (
            <label key={s.value} className={styles.check}>
              <input
                type="checkbox"
                checked={signals.includes(s.value)}
                onChange={() => toggle(s.value)}
              />
              {s.label}
            </label>
          ))}
          {signals.length > 0 ? (
            <p className={styles.safety}>{SAFETY_NOTICE}</p>
          ) : null}
        </fieldset>

        <button className={styles.primary} type="submit">
          Save log
        </button>
      </form>
      <StatePanel draft={draft} saved={saved} />
    </main>
  );
}
