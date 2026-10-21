"use client";

/**
 * PROTOTYPE — variant A, "One list": the whole session on one page, every
 * activity a card with its own controls inline, the clock pinned at the top
 * and the rest timer as a bar along the bottom.
 */

import {
  AddActivity,
  KeepAwake,
  activeMs,
  clock,
  status,
  type Activity,
  type Actions,
  type LiveProps,
} from "./shared";
import styles from "./prototype-live.module.css";

export const name = "One list";

export function VariantA({ w, now, act, onLeave, onFinish }: LiveProps) {
  const paused = w.pausedAt !== null;
  return (
    <main className={`${styles.page} ${styles.withBar}`}>
      <header className={styles.stickyHead}>
        <button className={styles.link} onClick={onLeave}>
          ‹ Leave
        </button>
        <div className={styles.headMid}>
          <span className={styles.headTitle}>{w.title}</span>
          <span className={styles.headClock}>{clock(activeMs(w, now))}</span>
        </div>
        <button className={styles.finishSmall} onClick={onFinish}>
          Finish
        </button>
      </header>
      <div className={styles.row}>
        <button
          className={styles.secondary}
          onClick={paused ? act.resume : act.pause}
        >
          {paused ? "▶ Continue" : "❚❚ Pause"}
        </button>
        <KeepAwake w={w} act={act} />
      </div>

      {w.activities.length === 0 && (
        <p className={styles.muted}>No activities yet. Add what you do.</p>
      )}
      {w.activities.map((a, i) => (
        <section
          key={a.id}
          className={`${styles.card} ${a.done ? styles.cardDone : ""}`}
        >
          <div className={styles.cardHead}>
            <div>
              <h3 className={styles.h3}>{a.name}</h3>
              {a.target && <p className={styles.muted}>{a.target}</p>}
            </div>
            <span className={styles.muted}>{status(a, now)}</span>
          </div>
          <Controls a={a} i={i} now={now} act={act} />
        </section>
      ))}
      <AddActivity act={act} />
    </main>
  );
}

function Controls({
  a,
  i,
  now,
  act,
}: {
  a: Activity;
  i: number;
  now: number;
  act: Actions;
}) {
  switch (a.mode) {
    case "sets_reps_load":
      return (
        <>
          <ol className={styles.sets}>
            {a.sets.map((s, j) => (
              <li key={j} className={s.done ? styles.setDone : ""}>
                <span className={styles.setNo}>{j + 1}</span>
                <Stepper
                  value={`${s.reps}`}
                  unit="reps"
                  minus={() => act.editSet(i, j, "reps", -1)}
                  plus={() => act.editSet(i, j, "reps", 1)}
                />
                <Stepper
                  value={`${s.load}`}
                  unit="kg"
                  minus={() => act.editSet(i, j, "load", -1)}
                  plus={() => act.editSet(i, j, "load", 1)}
                />
                <button
                  className={s.done ? styles.tickOn : styles.tick}
                  aria-label={`Set ${j + 1} done`}
                  onClick={() => act.toggleSet(i, j)}
                >
                  ✓
                </button>
              </li>
            ))}
          </ol>
          <button className={styles.quiet} onClick={() => act.addSet(i)}>
            + set
          </button>
        </>
      );
    // Owner, 21 Oct 2026: one clock for the whole workout and no other
    // timer, so a run or a timed block is ticked like anything else; its
    // distance and time are typed at Finish.
    case "skill_repetitions":
      return (
        <div className={styles.runRow}>
          <button className={styles.mini} onClick={() => act.count(i, -1)}>
            −1
          </button>
          <strong className={styles.bigNum}>
            {a.count}
            <small>/{a.countTarget}</small>
          </strong>
          <button className={styles.plusBig} onClick={() => act.count(i, 1)}>
            +1
          </button>
          <button className={styles.quiet} onClick={() => act.count(i, 10)}>
            +10
          </button>
        </div>
      );
    default:
      return (
        <button
          className={a.done ? styles.secondary : styles.primary}
          onClick={() => act.toggleDone(i)}
        >
          {a.done ? "✓ Done — undo" : "Mark done"}
        </button>
      );
  }
}

function Stepper({
  value,
  unit,
  minus,
  plus,
}: {
  value: string;
  unit: string;
  minus: () => void;
  plus: () => void;
}) {
  return (
    <span className={styles.stepper}>
      <button className={styles.mini} onClick={minus} aria-label="less">
        −
      </button>
      <span>
        {value}
        <small> {unit}</small>
      </span>
      <button className={styles.mini} onClick={plus} aria-label="more">
        +
      </button>
    </span>
  );
}
