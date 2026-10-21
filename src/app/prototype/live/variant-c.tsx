"use client";

/**
 * PROTOTYPE — variant C, "Clock first": a dark stopwatch panel owns the top
 * of the screen — session time, and whatever is counting now (rest, an
 * interval block, the current lap). Activities are chips to switch between;
 * the chosen one shows as a compact table. One big contextual button sits at
 * the thumb, like a sports watch.
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

export const name = "Clock first";

export function VariantC({ w, now, act, onLeave, onFinish }: LiveProps) {
  const i = w.current;
  const a = w.activities[i];
  const paused = w.pausedAt !== null;

  // What the panel counts besides the session clock.
  let big = clock(activeMs(w, now));
  let caption = paused ? "PAUSED" : "SESSION";
  let small: string | null = null;
  let ring: number | null = null;
  if (w.restUntil !== null) {
    small = big;
    big = clock(w.restUntil - now);
    caption = "REST";
    ring = (w.restUntil - now) / (w.restTotal * 1000);
  } else if (a?.mode === "time_distance_pace" && a.segmentStartedAt !== null) {
    const seg = a.segments[a.segmentIndex];
    small = big;
    big = clock(segmentLeftMs(a, now));
    caption = seg.label.toUpperCase();
    ring = segmentLeftMs(a, now) / (seg.seconds * 1000);
  } else if (
    a?.mode === "time_distance_pace" &&
    a.startedAt !== null &&
    !a.done
  ) {
    small = big;
    big = clock(runMs(a, now));
    caption = `${a.name.toUpperCase()} · LAP ${a.laps.length + 1} ${clock(currentLapMs(a, now))}`;
  } else if (
    a?.mode === "duration_intensity" &&
    a.startedAt !== null &&
    !a.done
  ) {
    small = big;
    big = clock(countdownLeftMs(a, now));
    caption = `${a.name.toUpperCase()} · LEFT`;
    ring = countdownLeftMs(a, now) / (a.minutes * 60_000);
  }

  // The one button at the thumb.
  let primary: { label: string; run: () => void } | null = null;
  if (w.restUntil !== null) {
    primary = { label: "Skip rest", run: act.restSkip };
  } else if (a) {
    switch (a.mode) {
      case "sets_reps_load": {
        const j = nextOpenSet(a);
        primary =
          j === -1
            ? { label: "+ another set", run: () => act.addSet(i) }
            : {
                label: `Set ${j + 1} done · ${a.sets[j].reps} × ${a.sets[j].load} kg`,
                run: () => act.toggleSet(i, j),
              };
        break;
      }
      case "time_distance_pace":
        if (a.segmentStartedAt !== null)
          primary = { label: "Next block", run: () => act.skipSegment(i) };
        else if (a.startedAt === null)
          primary = {
            label: a.segments.length ? "▶ Start intervals" : "▶ Start run",
            run: () => act.runStart(i),
          };
        else if (!a.done) primary = { label: "Lap", run: () => act.lap(i) };
        break;
      case "duration_intensity":
        if (a.startedAt === null)
          primary = {
            label: `▶ Start ${a.minutes} min`,
            run: () => act.countdownStart(i),
          };
        else if (!a.done)
          primary = { label: "End early", run: () => act.countdownEnd(i) };
        break;
      case "skill_repetitions":
        primary = { label: `+1 ${a.unit}`, run: () => act.count(i, 1) };
        break;
      default:
        primary = {
          label: a.done ? "Undo done" : "Done",
          run: () => act.toggleDone(i),
        };
    }
  }

  return (
    <main className={styles.clockPage}>
      <section className={styles.clockPanel}>
        <div className={styles.clockTop}>
          <button className={styles.linkLight} onClick={onLeave}>
            ‹ Leave
          </button>
          <span>{w.title}</span>
          <button className={styles.linkLight} onClick={onFinish}>
            Finish
          </button>
        </div>
        <div className={styles.dial}>
          {ring !== null && (
            <svg viewBox="0 0 100 100" className={styles.ring} aria-hidden>
              <circle cx="50" cy="50" r="46" className={styles.ringBack} />
              <circle
                cx="50"
                cy="50"
                r="46"
                className={styles.ringFront}
                style={{
                  strokeDasharray: `${Math.max(0, ring) * 289} 289`,
                }}
              />
            </svg>
          )}
          <span className={styles.dialCaption}>{caption}</span>
          <strong className={styles.dialBig}>{big}</strong>
          {small && <span className={styles.dialSmall}>session {small}</span>}
        </div>
        <div className={styles.clockButtons}>
          <button
            className={styles.linkLight}
            onClick={paused ? act.resume : act.pause}
          >
            {paused ? "▶ Continue" : "❚❚ Pause"}
          </button>
          {w.restUntil !== null && (
            <button
              className={styles.linkLight}
              onClick={() => act.restAdd(15)}
            >
              +15 s
            </button>
          )}
          {a?.mode === "time_distance_pace" &&
            a.startedAt !== null &&
            !a.done && (
              <button
                className={styles.linkLight}
                onClick={() => act.runStop(i)}
              >
                ■ Stop
              </button>
            )}
        </div>
      </section>

      <div className={styles.chips}>
        {w.activities.map((x, k) => (
          <button
            key={x.id}
            className={`${styles.chip} ${k === i ? styles.chipOn : ""} ${x.done ? styles.chipDone : ""}`}
            onClick={() => act.focus(k)}
          >
            {x.done ? "✓ " : ""}
            {x.name}
          </button>
        ))}
      </div>

      <div className={styles.clockBody}>
        {a ? (
          <>
            <div className={styles.cardHead}>
              <h2 className={styles.h3}>{a.name}</h2>
              <span className={styles.muted}>{status(a, now)}</span>
            </div>
            {a.target && <p className={styles.muted}>Plan: {a.target}</p>}

            {a.mode === "sets_reps_load" && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Reps</th>
                    <th>kg</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {a.sets.map((s, j) => (
                    <tr key={j} className={s.done ? styles.rowDone : ""}>
                      <td>{j + 1}</td>
                      <td>
                        <button
                          className={styles.mini}
                          onClick={() => act.editSet(i, j, "reps", -1)}
                        >
                          −
                        </button>
                        {s.reps}
                        <button
                          className={styles.mini}
                          onClick={() => act.editSet(i, j, "reps", 1)}
                        >
                          +
                        </button>
                      </td>
                      <td>
                        <button
                          className={styles.mini}
                          onClick={() => act.editSet(i, j, "load", -1)}
                        >
                          −
                        </button>
                        {s.load}
                        <button
                          className={styles.mini}
                          onClick={() => act.editSet(i, j, "load", 1)}
                        >
                          +
                        </button>
                      </td>
                      <td>
                        <button
                          className={s.done ? styles.tickOn : styles.tick}
                          onClick={() => act.toggleSet(i, j)}
                        >
                          ✓
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {a.mode === "time_distance_pace" && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{a.segments.length ? "Hard block" : "Lap"}</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {a.laps.length === 0 && (
                    <tr>
                      <td colSpan={2} className={styles.muted}>
                        No laps yet
                      </td>
                    </tr>
                  )}
                  {a.laps.map((l, k) => (
                    <tr key={k}>
                      <td>{k + 1}</td>
                      <td>{clock(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {a.mode === "skill_repetitions" && (
              <div className={styles.runRow}>
                <strong className={styles.bigNum}>
                  {a.count}
                  <small>/{a.countTarget}</small>
                </strong>
                <button
                  className={styles.mini}
                  onClick={() => act.count(i, -1)}
                >
                  −1
                </button>
                <button
                  className={styles.quiet}
                  onClick={() => act.count(i, 10)}
                >
                  +10
                </button>
              </div>
            )}
          </>
        ) : (
          <p className={styles.muted}>No activities yet.</p>
        )}
        <div className={styles.row}>
          <AddActivity act={act} />
          <KeepAwake w={w} act={act} />
        </div>
      </div>

      {primary && (
        <div className={styles.thumbBar}>
          <button className={styles.thumbBtn} onClick={primary.run}>
            {primary.label}
          </button>
        </div>
      )}
    </main>
  );
}
