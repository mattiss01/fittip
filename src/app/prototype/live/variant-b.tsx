"use client";

/**
 * PROTOTYPE — variant B, "One thing at a time": the screen shows only what
 * to do now — this set, this block, this counter — in big type with one big
 * button. Resting takes the whole screen. Activities are stepped through
 * with Previous / Next, like the log's steps.
 */

import {
  AddActivity,
  KeepAwake,
  activeMs,
  clock,
  countdownLeftMs,
  currentLapMs,
  nextOpenSet,
  runMs,
  segmentLeftMs,
  status,
  type LiveProps,
} from "./shared";
import styles from "./prototype-live.module.css";

export const name = "One thing at a time";

export function VariantB({ w, now, act, onLeave, onFinish }: LiveProps) {
  const i = w.current;
  const a = w.activities[i];
  const paused = w.pausedAt !== null;

  const top = (
    <header className={styles.focusTop}>
      <button className={styles.link} onClick={onLeave}>
        ‹ Leave
      </button>
      <span className={styles.focusClock}>
        {paused ? "paused " : ""}
        {clock(activeMs(w, now))}
      </span>
      <button className={styles.link} onClick={paused ? act.resume : act.pause}>
        {paused ? "▶" : "❚❚"}
      </button>
    </header>
  );

  const dots = (
    <div className={styles.dots}>
      {w.activities.map((x, k) => (
        <button
          key={x.id}
          className={`${styles.dot} ${x.done ? styles.dotDone : ""} ${k === i ? styles.dotNow : ""}`}
          aria-label={x.name}
          onClick={() => act.focus(k)}
        />
      ))}
    </div>
  );

  if (w.restUntil !== null) {
    const nextSet = a ? nextOpenSet(a) : -1;
    return (
      <main className={`${styles.focusPage} ${styles.restPage}`}>
        {top}
        <p className={styles.focusLabel}>REST</p>
        <strong className={styles.giant}>{clock(w.restUntil - now)}</strong>
        <p className={styles.focusSub}>after {w.restAfter}</p>
        <div className={styles.row}>
          <button className={styles.ghost} onClick={() => act.restAdd(15)}>
            +15 s
          </button>
          <button className={styles.ghost} onClick={act.restSkip}>
            Skip rest
          </button>
        </div>
        {a && nextSet !== -1 && (
          <p className={styles.focusSub}>
            Next: {a.name}, set {nextSet + 1} — {a.sets[nextSet].reps} ×{" "}
            {a.sets[nextSet].load} kg
          </p>
        )}
      </main>
    );
  }

  if (!a) {
    return (
      <main className={styles.focusPage}>
        {top}
        <p className={styles.focusLabel}>NOTHING YET</p>
        <AddActivity act={act} />
        <button className={styles.primary} onClick={onFinish}>
          Finish
        </button>
      </main>
    );
  }

  let body: React.ReactNode;
  switch (a.mode) {
    case "sets_reps_load": {
      const j = nextOpenSet(a);
      if (j === -1) {
        body = (
          <>
            <strong className={styles.giantText}>All sets done</strong>
            <button className={styles.ghost} onClick={() => act.addSet(i)}>
              + another set
            </button>
          </>
        );
      } else {
        const s = a.sets[j];
        body = (
          <>
            <p className={styles.focusLabel}>
              SET {j + 1} OF {a.sets.length}
            </p>
            <div className={styles.bigSteppers}>
              <div>
                <button onClick={() => act.editSet(i, j, "reps", -1)}>−</button>
                <strong>{s.reps}</strong>
                <button onClick={() => act.editSet(i, j, "reps", 1)}>+</button>
                <span>reps</span>
              </div>
              <div>
                <button onClick={() => act.editSet(i, j, "load", -1)}>−</button>
                <strong>{s.load}</strong>
                <button onClick={() => act.editSet(i, j, "load", 1)}>+</button>
                <span>kg</span>
              </div>
            </div>
            <button
              className={styles.hugeBtn}
              onClick={() => act.toggleSet(i, j)}
            >
              Set done
            </button>
            <p className={styles.focusSub}>
              then {a.restSeconds} s rest ·{" "}
              {a.sets.map((x) => (x.done ? "●" : "○")).join(" ")}
            </p>
          </>
        );
      }
      break;
    }
    case "time_distance_pace":
      if (a.segments.length > 0 && a.segmentStartedAt !== null) {
        const seg = a.segments[a.segmentIndex];
        body = (
          <div className={seg.hard ? styles.focusHard : styles.focusEasy}>
            <p className={styles.focusLabel}>{seg.label.toUpperCase()}</p>
            <strong className={styles.giant}>
              {clock(segmentLeftMs(a, now))}
            </strong>
            <button className={styles.ghost} onClick={() => act.skipSegment(i)}>
              Next block ›
            </button>
          </div>
        );
      } else if (a.startedAt === null) {
        body = (
          <button className={styles.hugeBtn} onClick={() => act.runStart(i)}>
            ▶ Start {a.segments.length > 0 ? "intervals" : "run"}
          </button>
        );
      } else if (a.done) {
        body = (
          <>
            <strong className={styles.giant}>
              {clock(
                a.segments.length > 0
                  ? a.laps.reduce((s, l) => s + l, 0)
                  : runMs(a, now),
              )}
            </strong>
            <p className={styles.focusSub}>
              {a.laps.map((l, k) => `${k + 1}: ${clock(l)}`).join(" · ")}
            </p>
          </>
        );
      } else {
        body = (
          <>
            <strong className={styles.giant}>{clock(runMs(a, now))}</strong>
            <p className={styles.focusSub}>
              lap {a.laps.length + 1} · {clock(currentLapMs(a, now))}
            </p>
            <button className={styles.hugeBtn} onClick={() => act.lap(i)}>
              Lap
            </button>
            <button className={styles.ghost} onClick={() => act.runStop(i)}>
              ■ Stop
            </button>
          </>
        );
      }
      break;
    case "duration_intensity":
      body =
        a.startedAt === null ? (
          <button
            className={styles.hugeBtn}
            onClick={() => act.countdownStart(i)}
          >
            ▶ Start {a.minutes} min
          </button>
        ) : (
          <>
            <strong className={styles.giant}>
              {a.done ? "Done" : clock(countdownLeftMs(a, now))}
            </strong>
            {!a.done && (
              <button
                className={styles.ghost}
                onClick={() => act.countdownEnd(i)}
              >
                End early
              </button>
            )}
          </>
        );
      break;
    case "skill_repetitions":
      body = (
        <>
          <button className={styles.counter} onClick={() => act.count(i, 1)}>
            <strong>{a.count}</strong>
            <span>
              of {a.countTarget} {a.unit} · tap +1
            </span>
          </button>
          <div className={styles.row}>
            <button className={styles.ghost} onClick={() => act.count(i, -1)}>
              −1
            </button>
            <button className={styles.ghost} onClick={() => act.count(i, 10)}>
              +10
            </button>
          </div>
        </>
      );
      break;
    default:
      body = (
        <button className={styles.hugeBtn} onClick={() => act.toggleDone(i)}>
          {a.done ? "✓ Done — undo" : "Done"}
        </button>
      );
  }

  return (
    <main className={styles.focusPage}>
      {top}
      {dots}
      <p className={styles.focusLabel}>
        {i + 1} / {w.activities.length} · {status(a, now)}
      </p>
      <h1 className={styles.focusName}>{a.name}</h1>
      {a.target && <p className={styles.focusSub}>{a.target}</p>}
      <div className={styles.focusBody}>{body}</div>
      <nav className={styles.focusNav}>
        <button
          className={styles.ghost}
          disabled={i === 0}
          onClick={() => act.focus(i - 1)}
        >
          ‹ Previous
        </button>
        {i < w.activities.length - 1 ? (
          <button className={styles.ghost} onClick={() => act.focus(i + 1)}>
            Next ›
          </button>
        ) : (
          <button className={styles.primary} onClick={onFinish}>
            Finish
          </button>
        )}
      </nav>
      <div className={styles.row}>
        <AddActivity act={act} />
        <KeepAwake w={w} act={act} />
      </div>
    </main>
  );
}
