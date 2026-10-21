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
  countdownLeftMs,
  currentLapMs,
  runMs,
  segmentLeftMs,
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

      {w.restUntil !== null && (
        <div className={styles.restBar}>
          <div
            className={styles.restFill}
            style={{
              width: `${(100 * (w.restUntil - now)) / (w.restTotal * 1000)}%`,
            }}
          />
          <span className={styles.restText}>
            Rest {clock(w.restUntil - now)}
            <small> after {w.restAfter}</small>
          </span>
          <button className={styles.restBtn} onClick={() => act.restAdd(15)}>
            +15 s
          </button>
          <button className={styles.restBtn} onClick={act.restSkip}>
            Skip
          </button>
        </div>
      )}
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
          <div className={styles.row}>
            <button className={styles.quiet} onClick={() => act.addSet(i)}>
              + set
            </button>
            <span className={styles.muted}>
              Rest{" "}
              <button
                className={styles.mini}
                onClick={() => act.setRest(i, -15)}
              >
                −
              </button>{" "}
              {a.restSeconds} s{" "}
              <button
                className={styles.mini}
                onClick={() => act.setRest(i, 15)}
              >
                +
              </button>
            </span>
          </div>
        </>
      );
    case "time_distance_pace":
      if (a.segments.length > 0) {
        const seg = a.segments[a.segmentIndex];
        if (a.segmentStartedAt === null)
          return a.done ? (
            <p>Hard blocks: {a.laps.map(clock).join(", ")}</p>
          ) : (
            <button className={styles.primary} onClick={() => act.runStart(i)}>
              ▶ Start intervals
            </button>
          );
        return (
          <div className={seg.hard ? styles.segHard : styles.segEasy}>
            <span>{seg.label}</span>
            <strong className={styles.bigNum}>
              {clock(segmentLeftMs(a, now))}
            </strong>
            <button className={styles.quiet} onClick={() => act.skipSegment(i)}>
              Next block ›
            </button>
          </div>
        );
      }
      if (a.startedAt === null)
        return (
          <button className={styles.primary} onClick={() => act.runStart(i)}>
            ▶ Start
          </button>
        );
      return (
        <>
          <div className={styles.runRow}>
            <strong className={styles.bigNum}>{clock(runMs(a, now))}</strong>
            {!a.done && (
              <span className={styles.muted}>
                lap {clock(currentLapMs(a, now))}
              </span>
            )}
          </div>
          {a.laps.length > 0 && (
            <p className={styles.muted}>
              {a.laps.map((l, k) => `${k + 1}: ${clock(l)}`).join(" · ")}
            </p>
          )}
          {!a.done && (
            <div className={styles.row}>
              <button className={styles.secondary} onClick={() => act.lap(i)}>
                Lap
              </button>
              <button className={styles.primary} onClick={() => act.runStop(i)}>
                ■ Stop
              </button>
            </div>
          )}
        </>
      );
    case "duration_intensity":
      if (a.startedAt === null)
        return (
          <button
            className={styles.primary}
            onClick={() => act.countdownStart(i)}
          >
            ▶ Start {a.minutes} min
          </button>
        );
      return (
        <div className={styles.runRow}>
          <strong className={styles.bigNum}>
            {a.done ? "Done" : clock(countdownLeftMs(a, now))}
          </strong>
          {!a.done && (
            <button
              className={styles.quiet}
              onClick={() => act.countdownEnd(i)}
            >
              End early
            </button>
          )}
        </div>
      );
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
