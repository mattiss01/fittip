"use client";

/**
 * PROTOTYPE — B: logging in steps. One question fills the screen; a tap
 * answers it and moves on. A skip asks nothing about training. "Anything
 * off?" cannot be passed by: it is answered with a signal or with "Nothing
 * was off", never left blank.
 */

import { useState } from "react";

import {
  FEELINGS,
  OUTCOMES,
  SAFETY_NOTICE,
  SESSION,
  SIGNALS,
  StatePanel,
  trained,
  useDraft,
  type Draft,
  type Signal,
} from "./shared";
import styles from "./prototype-log.module.css";

export const name = "Steps";

type Step =
  | "outcome"
  | "minutes"
  | "effort"
  | "feeling"
  | "activities"
  | "off"
  | "note"
  | "done";

function stepsFor(draft: Draft): Step[] {
  return trained(draft)
    ? ["outcome", "minutes", "effort", "feeling", "activities", "off", "note"]
    : ["outcome", "off", "note"];
}

export function VariantB() {
  const [draft, setDraft] = useDraft();
  const [step, setStep] = useState<Step>("outcome");
  const steps = stepsFor(draft);
  const index = steps.indexOf(step);

  const go = (next: Draft, from: Step = step) => {
    setDraft(next);
    const list = stepsFor(next);
    setStep(list[list.indexOf(from) + 1] ?? "done");
  };
  const back = () => setStep(steps[Math.max(0, index - 1)]);
  const signals = draft.signals ?? [];

  return (
    <main className={styles.stepPage}>
      <header className={styles.stepHead}>
        {index > 0 && step !== "done" ? (
          <button type="button" className={styles.stepBack} onClick={back}>
            ‹ Back
          </button>
        ) : (
          <span />
        )}
        <span className={styles.stepTitle}>
          {SESSION.title} · {SESSION.date}
        </span>
        <span className={styles.stepCount}>
          {step === "done" ? "" : `${index + 1}/${steps.length}`}
        </span>
      </header>
      {step === "done" ? null : (
        <div className={styles.progress}>
          {steps.map((s, i) => (
            <span key={s} data-on={i <= index} />
          ))}
        </div>
      )}

      <section className={styles.question} key={step}>
        {step === "outcome" ? (
          <>
            <h1>How did it go?</h1>
            <div className={styles.bigChoices}>
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  data-selected={draft.outcome === o.value}
                  onClick={() => go({ ...draft, outcome: o.value })}
                >
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === "minutes" ? (
          <>
            <h1>How long?</h1>
            <p className={styles.sub}>{SESSION.plannedMinutes} min planned</p>
            <div className={styles.stepper}>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    minutes: Math.max(0, draft.minutes - 5),
                  })
                }
              >
                −5
              </button>
              <output>
                {draft.minutes}
                <small>min</small>
              </output>
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, minutes: draft.minutes + 5 })
                }
              >
                +5
              </button>
            </div>
            <button
              type="button"
              className={styles.primary}
              onClick={() => go(draft)}
            >
              Next
            </button>
          </>
        ) : null}

        {step === "effort" ? (
          <>
            <h1>How hard was it?</h1>
            <p className={styles.sub}>
              1 is barely anything, 10 is everything.
            </p>
            <div className={styles.effortGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-selected={draft.effort === n}
                  onClick={() => go({ ...draft, effort: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.skipLink}
              onClick={() => go({ ...draft, effort: null })}
            >
              Skip this question
            </button>
          </>
        ) : null}

        {step === "feeling" ? (
          <>
            <h1>How did it feel?</h1>
            <div className={styles.bigChoices}>
              {[...FEELINGS].reverse().map((f) => (
                <button
                  key={f.value}
                  type="button"
                  data-selected={draft.feeling === f.value}
                  onClick={() => go({ ...draft, feeling: f.value })}
                >
                  <strong>{f.label}</strong>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.skipLink}
              onClick={() => go({ ...draft, feeling: null })}
            >
              Skip this question
            </button>
          </>
        ) : null}

        {step === "activities" ? (
          <>
            <h1>Did you do what was planned?</h1>
            <ul className={styles.activityList}>
              {SESSION.activities.map((a) => (
                <li key={a.name}>
                  <strong>{a.name}</strong> {a.target}
                </li>
              ))}
            </ul>
            <div className={styles.bigChoices}>
              <button
                type="button"
                data-selected={draft.activitiesAsPlanned === true}
                onClick={() => go({ ...draft, activitiesAsPlanned: true })}
              >
                <strong>Yes, as planned</strong>
              </button>
              <button
                type="button"
                data-selected={draft.activitiesAsPlanned === false}
                onClick={() => go({ ...draft, activitiesAsPlanned: false })}
              >
                <strong>Something was different</strong>
                <span>The activity editor would open here.</span>
              </button>
            </div>
          </>
        ) : null}

        {step === "off" ? (
          <>
            <h1>Anything off?</h1>
            <p className={styles.sub}>Pick any that apply.</p>
            <div className={styles.bigChoices}>
              {SIGNALS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  data-selected={signals.includes(s.value)}
                  aria-pressed={signals.includes(s.value)}
                  onClick={() => {
                    const next: Signal[] = signals.includes(s.value)
                      ? signals.filter((x) => x !== s.value)
                      : [...signals, s.value];
                    setDraft({ ...draft, signals: next });
                  }}
                >
                  <strong>{s.label}</strong>
                </button>
              ))}
            </div>
            {signals.length > 0 ? (
              <>
                <p className={styles.safety}>{SAFETY_NOTICE}</p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => go(draft)}
                >
                  Next
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => go({ ...draft, signals: [] })}
              >
                Nothing was off
              </button>
            )}
          </>
        ) : null}

        {step === "note" ? (
          <>
            <h1>Anything to add?</h1>
            <p className={styles.sub}>Optional.</p>
            <textarea
              className={styles.bigNote}
              rows={4}
              value={draft.note}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
            <button
              type="button"
              className={styles.primary}
              onClick={() => setStep("done")}
            >
              Save log
            </button>
          </>
        ) : null}

        {step === "done" ? (
          <>
            <h1>Log saved.</h1>
            <Summary draft={draft} onEdit={setStep} />
          </>
        ) : null}
      </section>

      <StatePanel draft={draft} saved={step === "done"} />
    </main>
  );
}

function Summary({
  draft,
  onEdit,
}: {
  draft: Draft;
  onEdit: (step: Step) => void;
}) {
  const rows: [Step, string, string][] = [
    [
      "outcome",
      "How it went",
      OUTCOMES.find((o) => o.value === draft.outcome)?.label ?? "—",
    ],
    ...(trained(draft)
      ? ([
          ["minutes", "Duration", `${draft.minutes} min`],
          ["effort", "Effort", draft.effort ? `${draft.effort} of 10` : "—"],
          [
            "feeling",
            "Felt",
            FEELINGS.find((f) => f.value === draft.feeling)?.label ?? "—",
          ],
          [
            "activities",
            "Activities",
            draft.activitiesAsPlanned ? "As planned" : "Changed",
          ],
        ] as [Step, string, string][])
      : []),
    [
      "off",
      "Anything off",
      draft.signals && draft.signals.length > 0
        ? draft.signals
            .map((s) => SIGNALS.find((x) => x.value === s)?.label)
            .join(", ")
        : "Nothing",
    ],
  ];
  return (
    <dl className={styles.summary}>
      {rows.map(([step, term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
          <button type="button" onClick={() => onEdit(step)}>
            Change
          </button>
        </div>
      ))}
    </dl>
  );
}
