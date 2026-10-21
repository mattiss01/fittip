"use client";

/**
 * PROTOTYPE — what the three live-workout variants share: example sessions,
 * the workout state (held in memory here; the real one would be a database
 * row), the clock, the rest and interval timers, and the start, resume and
 * finish screens. Only the live screen differs between variants. Nothing is
 * saved. Throwaway: lives on prototype/live-workout, never merges to master.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./prototype-live.module.css";

export type Mode =
  | "sets_reps_load"
  | "time_distance_pace"
  | "duration_intensity"
  | "skill_repetitions"
  | "unmeasured";

export type SetRow = { reps: number; load: number; done: boolean };
export type Segment = { label: string; seconds: number; hard: boolean };

export type Activity = {
  id: string;
  name: string;
  mode: Mode;
  /** What the plan asked for, in words. */
  target: string;
  restSeconds: number;
  sets: SetRow[];
  /** Run: started, laps (split ms), stopped. */
  startedAt: number | null;
  stoppedAt: number | null;
  laps: number[];
  /** Run intervals: the plan's blocks, which one is running, since when. */
  segments: Segment[];
  segmentIndex: number;
  segmentStartedAt: number | null;
  /** Duration: planned minutes; the countdown runs from startedAt. */
  minutes: number;
  /** Skill repetitions. */
  count: number;
  countTarget: number;
  unit: string;
  done: boolean;
  /** Typed at Finish for a run. */
  distance: string;
};

export type Workout = {
  title: string;
  sport: string;
  planned: boolean;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  activities: Activity[];
  /** The activity the focused variants show. */
  current: number;
  restUntil: number | null;
  restTotal: number;
  restAfter: string;
  keepAwake: boolean;
};

type Seed = {
  name: string;
  mode: Mode;
  target: string;
  restSeconds?: number;
  sets?: [number, number][];
  segments?: Segment[];
  minutes?: number;
  countTarget?: number;
  unit?: string;
};

type Template = {
  key: string;
  title: string;
  sport: string;
  minutes: number;
  activities: Seed[];
};

function intervals(blocks: number, hard: number, easy: number): Segment[] {
  return Array.from({ length: blocks }, (_, i) => [
    { label: `Hard ${i + 1} of ${blocks}`, seconds: hard, hard: true },
    { label: `Easy ${i + 1} of ${blocks}`, seconds: easy, hard: false },
  ]).flat();
}

export const TEMPLATES: Template[] = [
  {
    key: "strength",
    title: "Upper body strength",
    sport: "Strength",
    minutes: 50,
    activities: [
      {
        name: "Bench press",
        mode: "sets_reps_load",
        target: "3×8 at 60 kg, 1×5 at 70 kg",
        restSeconds: 120,
        sets: [
          [8, 60],
          [8, 60],
          [8, 60],
          [5, 70],
        ],
      },
      {
        name: "Pull-ups",
        mode: "sets_reps_load",
        target: "3×6",
        restSeconds: 90,
        sets: [
          [6, 0],
          [6, 0],
          [6, 0],
        ],
      },
      {
        name: "Face pulls",
        mode: "sets_reps_load",
        target: "3×15 at 15 kg",
        restSeconds: 60,
        sets: [
          [15, 15],
          [15, 15],
          [15, 15],
        ],
      },
      { name: "Shoulder mobility", mode: "unmeasured", target: "as it feels" },
    ],
  },
  {
    key: "run",
    title: "Intervals 6 × 1 min",
    sport: "Running",
    minutes: 40,
    activities: [
      {
        name: "Warm-up jog",
        mode: "time_distance_pace",
        target: "10 min easy, about 6:30/km",
      },
      {
        name: "Intervals",
        mode: "time_distance_pace",
        target: "6 × 1 min hard, 1 min easy",
        segments: intervals(6, 60, 60),
      },
      {
        name: "Cool-down",
        mode: "duration_intensity",
        target: "10 min easy",
        minutes: 10,
      },
    ],
  },
  {
    key: "tennis",
    title: "Tennis practice",
    sport: "Tennis",
    minutes: 60,
    activities: [
      {
        name: "Serves",
        mode: "skill_repetitions",
        target: "50 serves",
        countTarget: 50,
        unit: "serves",
      },
      {
        name: "Rally drill",
        mode: "duration_intensity",
        target: "20 min moderate",
        minutes: 20,
      },
      { name: "Footwork ladder", mode: "unmeasured", target: "a few rounds" },
    ],
  },
];

/** A stand-in for the owner's library, for "Add activity". */
export const LIBRARY: Seed[] = [
  {
    name: "Squat",
    mode: "sets_reps_load",
    target: "",
    restSeconds: 120,
    sets: [[8, 40]],
  },
  { name: "Easy run", mode: "time_distance_pace", target: "" },
  { name: "Bike", mode: "duration_intensity", target: "", minutes: 20 },
  {
    name: "Jump rope",
    mode: "skill_repetitions",
    target: "",
    countTarget: 100,
    unit: "skips",
  },
  { name: "Stretching", mode: "unmeasured", target: "" },
];

let nextId = 0;

function toActivity(seed: Seed): Activity {
  nextId += 1;
  return {
    id: `a${nextId}`,
    name: seed.name,
    mode: seed.mode,
    target: seed.target,
    restSeconds: seed.restSeconds ?? 90,
    sets: (seed.sets ?? []).map(([reps, load]) => ({
      reps,
      load,
      done: false,
    })),
    startedAt: null,
    stoppedAt: null,
    laps: [],
    segments: seed.segments ?? [],
    segmentIndex: 0,
    segmentStartedAt: null,
    minutes: seed.minutes ?? 0,
    count: 0,
    countTarget: seed.countTarget ?? 0,
    unit: seed.unit ?? "",
    done: false,
    distance: "",
  };
}

function newWorkout(
  title: string,
  sport: string,
  planned: boolean,
  seeds: Seed[],
): Workout {
  return {
    title,
    sport,
    planned,
    startedAt: Date.now(),
    pausedAt: null,
    pausedMs: 0,
    activities: seeds.map(toActivity),
    current: 0,
    restUntil: null,
    restTotal: 0,
    restAfter: "",
    keepAwake: true,
  };
}

/* ---------- time ---------- */

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function activeMs(w: Workout, now: number): number {
  return (w.pausedAt ?? now) - w.startedAt - w.pausedMs;
}

export function runMs(a: Activity, now: number): number {
  if (a.startedAt === null) return 0;
  return (a.stoppedAt ?? now) - a.startedAt;
}

export function currentLapMs(a: Activity, now: number): number {
  const done = a.laps.reduce((sum, lap) => sum + lap, 0);
  return runMs(a, now) - done;
}

export function segmentLeftMs(a: Activity, now: number): number {
  const segment = a.segments[a.segmentIndex];
  if (!segment || a.segmentStartedAt === null) return 0;
  return segment.seconds * 1000 - (now - a.segmentStartedAt);
}

export function countdownLeftMs(a: Activity, now: number): number {
  if (a.startedAt === null) return a.minutes * 60_000;
  return a.minutes * 60_000 - ((a.stoppedAt ?? now) - a.startedAt);
}

export function nextOpenSet(a: Activity): number {
  return a.sets.findIndex((set) => !set.done);
}

export function progress(a: Activity): { done: number; of: number } {
  switch (a.mode) {
    case "sets_reps_load":
      return { done: a.sets.filter((s) => s.done).length, of: a.sets.length };
    case "skill_repetitions":
      return { done: Math.min(a.count, a.countTarget), of: a.countTarget };
    default:
      return { done: a.done ? 1 : 0, of: 1 };
  }
}

/** A short line on where an activity stands. */
export function status(a: Activity, now: number): string {
  switch (a.mode) {
    case "sets_reps_load": {
      const { done, of } = progress(a);
      return `${done} of ${of} sets`;
    }
    case "time_distance_pace":
      if (a.segments.length > 0) {
        if (a.done) return "done";
        if (a.segmentStartedAt === null) return "not started";
        return a.segments[a.segmentIndex]?.label ?? "";
      }
      if (a.startedAt === null) return "not started";
      return `${clock(runMs(a, now))}${a.laps.length ? ` · ${a.laps.length} laps` : ""}${a.done ? " · done" : ""}`;
    case "duration_intensity":
      if (a.startedAt === null) return `${a.minutes} min`;
      return a.done
        ? `done · ${clock(runMs(a, now))}`
        : `${clock(countdownLeftMs(a, now))} left`;
    case "skill_repetitions":
      return `${a.count} of ${a.countTarget} ${a.unit}`;
    default:
      return a.done ? "done" : "to do";
  }
}

/* ---------- signal ---------- */

function signal() {
  try {
    navigator.vibrate?.([200, 100, 200]);
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close();
  } catch {
    // A prototype: no sound is fine.
  }
}

/* ---------- actions ---------- */

export type Actions = ReturnType<typeof useActions>;

function useActions(setWorkout: (fn: (w: Workout) => Workout) => void) {
  const change = useCallback(
    (fn: (w: Workout) => void) =>
      setWorkout((w) => {
        const copy = structuredClone(w);
        fn(copy);
        return copy;
      }),
    [setWorkout],
  );

  return {
    change,
    focus: (index: number) =>
      change((w) => {
        w.current = Math.max(0, Math.min(w.activities.length - 1, index));
      }),
    pause: () =>
      change((w) => {
        w.pausedAt = Date.now();
      }),
    resume: () =>
      change((w) => {
        if (w.pausedAt !== null) w.pausedMs += Date.now() - w.pausedAt;
        w.pausedAt = null;
      }),
    toggleSet: (a: number, i: number) =>
      change((w) => {
        const act = w.activities[a];
        const set = act.sets[i];
        set.done = !set.done;
        if (set.done) {
          w.restUntil = Date.now() + act.restSeconds * 1000;
          w.restTotal = act.restSeconds;
          w.restAfter = `${act.name}, set ${i + 1}`;
          if (nextOpenSet(act) === -1) act.done = true;
        } else {
          act.done = false;
        }
      }),
    editSet: (a: number, i: number, field: "reps" | "load", delta: number) =>
      change((w) => {
        const set = w.activities[a].sets[i];
        const step = field === "load" ? 2.5 : 1;
        set[field] = Math.max(0, set[field] + delta * step);
      }),
    addSet: (a: number) =>
      change((w) => {
        const act = w.activities[a];
        const last = act.sets[act.sets.length - 1] ?? { reps: 8, load: 0 };
        act.sets.push({ reps: last.reps, load: last.load, done: false });
        act.done = false;
      }),
    restAdd: (seconds: number) =>
      change((w) => {
        if (w.restUntil === null) return;
        w.restUntil += seconds * 1000;
        w.restTotal += seconds;
      }),
    restSkip: () =>
      change((w) => {
        w.restUntil = null;
      }),
    setRest: (a: number, delta: number) =>
      change((w) => {
        const act = w.activities[a];
        act.restSeconds = Math.max(15, act.restSeconds + delta);
      }),
    runStart: (a: number) =>
      change((w) => {
        const act = w.activities[a];
        act.startedAt = Date.now();
        act.stoppedAt = null;
        if (act.segments.length > 0) {
          act.segmentIndex = 0;
          act.segmentStartedAt = act.startedAt;
        }
      }),
    lap: (a: number) =>
      change((w) => {
        const act = w.activities[a];
        if (act.startedAt === null || act.stoppedAt !== null) return;
        act.laps.push(currentLapMs(act, Date.now()));
      }),
    runStop: (a: number) =>
      change((w) => {
        const act = w.activities[a];
        if (act.startedAt === null) return;
        const now = Date.now();
        if (act.segments.length === 0 && currentLapMs(act, now) > 1000) {
          act.laps.push(currentLapMs(act, now));
        }
        act.stoppedAt = now;
        act.segmentStartedAt = null;
        act.done = true;
      }),
    skipSegment: (a: number) =>
      change((w) => {
        advanceSegment(w.activities[a], Date.now());
      }),
    countdownStart: (a: number) =>
      change((w) => {
        w.activities[a].startedAt = Date.now();
        w.activities[a].stoppedAt = null;
      }),
    countdownEnd: (a: number) =>
      change((w) => {
        const act = w.activities[a];
        act.stoppedAt = Date.now();
        act.done = true;
      }),
    count: (a: number, delta: number) =>
      change((w) => {
        const act = w.activities[a];
        act.count = Math.max(0, act.count + delta);
        act.done = act.count >= act.countTarget;
      }),
    toggleDone: (a: number) =>
      change((w) => {
        w.activities[a].done = !w.activities[a].done;
      }),
    setDistance: (a: number, value: string) =>
      change((w) => {
        w.activities[a].distance = value;
      }),
    addActivity: (seed: Seed) =>
      change((w) => {
        w.activities.push(toActivity(seed));
        w.current = w.activities.length - 1;
      }),
    toggleAwake: () =>
      change((w) => {
        w.keepAwake = !w.keepAwake;
      }),
  };
}

function advanceSegment(act: Activity, now: number) {
  if (act.segmentStartedAt === null) return;
  const segment = act.segments[act.segmentIndex];
  // A hard block's real time is kept as a lap.
  if (segment?.hard) act.laps.push(now - act.segmentStartedAt);
  act.segmentIndex += 1;
  if (act.segmentIndex >= act.segments.length) {
    act.segmentStartedAt = null;
    act.stoppedAt = now;
    act.done = true;
  } else {
    act.segmentStartedAt = now;
  }
}

/* ---------- the host ---------- */

export type LiveProps = {
  w: Workout;
  now: number;
  act: Actions;
  onLeave: () => void;
  onFinish: () => void;
};

type Phase = "start" | "live" | "finish" | "logged";

export function LivePrototype({
  Live,
}: {
  Live: (props: LiveProps) => React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("start");
  const [workout, setWorkout] = useState<Workout | null>(null);
  const now = useNow();
  const act = useActions(
    useCallback(
      (fn: (w: Workout) => Workout) => setWorkout((w) => (w ? fn(w) : w)),
      [],
    ),
  );

  // Timers that end on their own: rest, an interval block, a countdown.
  useEffect(() => {
    if (!workout || workout.pausedAt !== null) return;
    let ring = false;
    const due =
      (workout.restUntil !== null && now >= workout.restUntil) ||
      workout.activities.some(
        (a) =>
          (a.segmentStartedAt !== null && segmentLeftMs(a, now) <= 0) ||
          (a.mode === "duration_intensity" &&
            a.startedAt !== null &&
            !a.done &&
            countdownLeftMs(a, now) <= 0),
      );
    if (!due) return;
    act.change((w) => {
      if (w.restUntil !== null && now >= w.restUntil) {
        w.restUntil = null;
        ring = true;
      }
      for (const a of w.activities) {
        if (a.segmentStartedAt !== null && segmentLeftMs(a, now) <= 0) {
          advanceSegment(a, now);
          ring = true;
        }
        if (
          a.mode === "duration_intensity" &&
          a.startedAt !== null &&
          !a.done &&
          countdownLeftMs(a, now) <= 0
        ) {
          a.stoppedAt = now;
          a.done = true;
          ring = true;
        }
      }
    });
    if (ring) signal();
  }, [now, workout, act]);

  useWakeLock(phase === "live" && (workout?.keepAwake ?? false));

  return (
    <>
      {phase === "start" && (
        <StartScreen
          unfinished={workout}
          now={now}
          onStart={(w) => {
            setWorkout(w);
            setPhase("live");
          }}
          onContinue={() => setPhase("live")}
          onLogWhatWasDone={() => setPhase("finish")}
          onDiscard={() => setWorkout(null)}
        />
      )}
      {phase === "live" && workout && (
        <Live
          w={workout}
          now={now}
          act={act}
          onLeave={() => setPhase("start")}
          onFinish={() => setPhase("finish")}
        />
      )}
      {phase === "finish" && workout && (
        <FinishScreen
          w={workout}
          now={now}
          act={act}
          onBack={() => setPhase("live")}
          onLog={() => setPhase("logged")}
        />
      )}
      {phase === "logged" && workout && (
        <LoggedScreen
          w={workout}
          now={now}
          onDone={() => {
            setWorkout(null);
            setPhase("start");
          }}
        />
      )}
      {workout && phase !== "logged" && <StatePanel w={workout} />}
    </>
  );
}

function useWakeLock(on: boolean) {
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let cancelled = false;
    (
      navigator as Navigator & {
        wakeLock: {
          request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
        };
      }
    ).wakeLock
      .request("screen")
      .then((sentinel) => {
        if (cancelled) void sentinel.release();
        else lock.current = sentinel;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock.current?.release();
      lock.current = null;
    };
  }, [on]);
}

/* ---------- start / resume ---------- */

function StartScreen({
  unfinished,
  now,
  onStart,
  onContinue,
  onLogWhatWasDone,
  onDiscard,
}: {
  unfinished: Workout | null;
  now: number;
  onStart: (w: Workout) => void;
  onContinue: () => void;
  onLogWhatWasDone: () => void;
  onDiscard: () => void;
}) {
  const [scratch, setScratch] = useState(false);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Strength");

  return (
    <main className={styles.page}>
      <p className={styles.kicker}>TODAY · TUE 21 OCT</p>
      <h1 className={styles.h1}>Train</h1>

      {unfinished && (
        <section className={`${styles.card} ${styles.unfinished}`}>
          <p className={styles.kicker}>UNFINISHED WORKOUT</p>
          <h2 className={styles.h2}>{unfinished.title}</h2>
          <p className={styles.muted}>
            Started {clock(now - unfinished.startedAt)} ago ·{" "}
            {clock(activeMs(unfinished, now))} trained ·{" "}
            {unfinished.activities
              .map((a) => `${a.name} ${status(a, now)}`)
              .join(" · ")}
          </p>
          <button className={styles.primary} onClick={onContinue}>
            Continue workout
          </button>
          <div className={styles.row}>
            <button className={styles.secondary} onClick={onLogWhatWasDone}>
              Log what was done
            </button>
            <button className={styles.quiet} onClick={onDiscard}>
              Discard
            </button>
          </div>
        </section>
      )}

      <h2 className={styles.section}>Planned today</h2>
      {TEMPLATES.map((t) => (
        <section key={t.key} className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.kicker}>
                {t.sport.toUpperCase()} · {t.minutes} MIN
              </p>
              <h3 className={styles.h3}>{t.title}</h3>
            </div>
            <button
              className={styles.start}
              disabled={unfinished !== null}
              onClick={() =>
                onStart(newWorkout(t.title, t.sport, true, t.activities))
              }
            >
              ▶ Start
            </button>
          </div>
          <ul className={styles.plainList}>
            {t.activities.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong> <span>{a.target}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {unfinished && (
        <p className={styles.muted}>
          One workout at a time: continue, log or discard the unfinished one
          first.
        </p>
      )}

      <h2 className={styles.section}>Not planned</h2>
      {!scratch ? (
        <button
          className={styles.secondary}
          disabled={unfinished !== null}
          onClick={() => setScratch(true)}
        >
          + Start a workout from scratch
        </button>
      ) : (
        <section className={styles.card}>
          <label className={styles.field}>
            <span>What is it?</span>
            <input
              value={title}
              placeholder="Gym, evening"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Sport</span>
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              <option>Strength</option>
              <option>Running</option>
              <option>Cycling</option>
              <option>Tennis</option>
            </select>
          </label>
          <button
            className={styles.primary}
            onClick={() =>
              onStart(newWorkout(title || "Workout", sport, false, []))
            }
          >
            ▶ Start — add activities as you go
          </button>
        </section>
      )}
    </main>
  );
}

/* ---------- finish ---------- */

/** Done sets collapsed into the log's groups: 3×8 at 60 kg, 1×5 at 70 kg. */
export function groups(a: Activity): string {
  const done = a.sets.filter((s) => s.done);
  if (done.length === 0) return "no sets done";
  const out: { n: number; reps: number; load: number }[] = [];
  for (const s of done) {
    const last = out[out.length - 1];
    if (last && last.reps === s.reps && last.load === s.load) last.n += 1;
    else out.push({ n: 1, reps: s.reps, load: s.load });
  }
  return out
    .map((g) => `${g.n}×${g.reps}${g.load ? ` at ${g.load} kg` : ""}`)
    .join(", ");
}

function pace(ms: number, km: number): string {
  if (!km || ms <= 0) return "";
  return `${clock(ms / km)}/km`;
}

function runTime(a: Activity, now: number): number {
  return a.segments.length > 0
    ? a.laps.reduce((s, l) => s + l, 0)
    : runMs(a, now);
}

function summary(a: Activity, now: number): string {
  switch (a.mode) {
    case "sets_reps_load":
      return groups(a);
    case "time_distance_pace": {
      if (a.startedAt === null) return "not started";
      const t = runTime(a, now);
      const label = a.segments.length > 0 ? "hard time" : "time";
      return `${label} ${clock(t)}${a.laps.length ? ` · laps ${a.laps.map(clock).join(", ")}` : ""}`;
    }
    case "duration_intensity":
      return a.startedAt === null
        ? "not started"
        : `${Math.round(runMs(a, now) / 60000)} min`;
    case "skill_repetitions":
      return `${a.count} of ${a.countTarget} ${a.unit}`;
    default:
      return a.done ? "done" : "not done";
  }
}

function allDone(w: Workout): boolean {
  return w.activities.length > 0 && w.activities.every((a) => a.done);
}

function FinishScreen({
  w,
  now,
  act,
  onBack,
  onLog,
}: {
  w: Workout;
  now: number;
  act: Actions;
  onBack: () => void;
  onLog: () => void;
}) {
  return (
    <main className={styles.page}>
      <p className={styles.kicker}>FINISH</p>
      <h1 className={styles.h1}>{w.title}</h1>
      <p className={styles.muted}>
        {clock(activeMs(w, now))} trained. Check what was done; the log steps
        open next with this filled in.
      </p>
      {w.activities.map((a, i) => (
        <section key={a.id} className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.h3}>{a.name}</h3>
            <span className={a.done ? styles.badgeDone : styles.badgeOpen}>
              {a.done ? "done" : "open"}
            </span>
          </div>
          <p>{summary(a, now)}</p>
          {a.mode === "time_distance_pace" && a.startedAt !== null && (
            <label className={styles.field}>
              <span>How far? (km, from your watch or the route)</span>
              <input
                inputMode="decimal"
                value={a.distance}
                placeholder="e.g. 5.2"
                onChange={(e) => act.setDistance(i, e.target.value)}
              />
              {Number(a.distance.replace(",", ".")) > 0 && (
                <small className={styles.muted}>
                  Pace{" "}
                  {pace(runTime(a, now), Number(a.distance.replace(",", ".")))}
                </small>
              )}
            </label>
          )}
        </section>
      ))}
      <button className={styles.primary} onClick={onLog}>
        Continue to the log
      </button>
      <button className={styles.secondary} onClick={onBack}>
        Back to the workout
      </button>
      <p className={styles.muted}>
        The log will suggest “{allDone(w) ? "Completed" : "Partly completed"}” —
        you still choose.
      </p>
    </main>
  );
}

function LoggedScreen({
  w,
  now,
  onDone,
}: {
  w: Workout;
  now: number;
  onDone: () => void;
}) {
  return (
    <main className={styles.page}>
      <p className={styles.kicker}>PROTOTYPE STOPS HERE</p>
      <h1 className={styles.h1}>The log steps open</h1>
      <section className={styles.card}>
        <p>
          The real log (the steps you know) opens{" "}
          {w.planned ? "for the planned session" : "as unplanned training"},
          with:
        </p>
        <ul className={styles.plainList}>
          <li>
            <strong>How long?</strong> {Math.round(activeMs(w, now) / 60000)}{" "}
            min (the clock, pauses left out)
          </li>
          <li>
            <strong>What did you do in it?</strong>{" "}
            {w.activities
              .map((a) => `${a.name}: ${summary(a, now)}`)
              .join(" · ")}
          </li>
        </ul>
        <p>Still asked as today:</p>
        <ul className={styles.plainList}>
          <li>
            How did it go? (suggested:{" "}
            {allDone(w) ? "Completed" : "Partly completed"})
          </li>
          <li>How hard was it?</li>
          <li>Anything off? — never skipped</li>
          <li>Anything to add?</li>
        </ul>
        <p className={styles.muted}>
          Saving the log removes the unfinished workout in the same step, so it
          cannot be logged twice.
        </p>
      </section>
      <button className={styles.primary} onClick={onDone}>
        Back to start
      </button>
    </main>
  );
}

/* ---------- small shared pieces ---------- */

export function AddActivity({ act }: { act: Actions }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={styles.secondary} onClick={() => setOpen(true)}>
        + Add activity
      </button>
    );
  }
  return (
    <section className={styles.card}>
      <p className={styles.kicker}>FROM YOUR LIBRARY</p>
      {LIBRARY.map((seed) => (
        <button
          key={seed.name}
          className={styles.listButton}
          onClick={() => {
            act.addActivity(seed);
            setOpen(false);
          }}
        >
          {seed.name}
        </button>
      ))}
      <button className={styles.quiet} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </section>
  );
}

export function KeepAwake({ w, act }: { w: Workout; act: Actions }) {
  return (
    <label className={styles.awake}>
      <input type="checkbox" checked={w.keepAwake} onChange={act.toggleAwake} />
      Keep screen on
    </label>
  );
}

function StatePanel({ w }: { w: Workout }) {
  return (
    <details className={styles.state}>
      <summary>What the database would hold</summary>
      <pre>{JSON.stringify(w, null, 1)}</pre>
    </details>
  );
}
