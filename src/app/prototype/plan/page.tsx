/**
 * PROTOTYPE — the Plan as weeks over a three-month horizon. Sample data only,
 * no account needed, nothing is saved. Throwaway: lives on the
 * prototype/plan-horizon branch and never merges to master.
 *
 * Question it answers: does a long horizon feel good when days are grouped by
 * week, empty days are one line, far weeks are folded, recurring sessions past
 * the written window are drawn as "repeats", and the roadmap's phases carry
 * the far end?
 */

import { notFound } from "next/navigation";

import s from "./plan.module.css";

type Sport = "Run" | "Strength" | "Mobility";
type Session = {
  title: string;
  sport: Sport;
  minutes: number;
  recurring?: boolean;
  race?: boolean;
};
type Day = { date: Date; sessions: Session[]; recovery: boolean };

const TODAY = new Date(Date.UTC(2026, 8, 29));
const WEEKS = 13;
/** Recurring sessions are real rows this far ahead; beyond it they are repeats. */
const WRITTEN_DAYS = 14;

const PHASES = [
  { until: Date.UTC(2026, 9, 18), name: "Sharpen", goal: "10k under 48 min" },
  {
    until: Date.UTC(2026, 10, 1),
    name: "Recover",
    goal: "Easy weeks after the race",
  },
  {
    until: Date.UTC(2026, 11, 31),
    name: "Base for the half",
    goal: "Half marathon in spring",
  },
];

function sessionsFor(date: Date, index: number): Session[] {
  const weekday = date.getUTCDay(); // 0 Sunday
  const t = date.getTime();
  if (t === Date.UTC(2026, 9, 18)) {
    return [{ title: "10k race", sport: "Run", minutes: 48, race: true }];
  }
  const out: Session[] = [];
  if (weekday === 1)
    out.push({ title: "Easy run", sport: "Run", minutes: 40, recurring: true });
  if (weekday === 3)
    out.push({
      title: "Lower body strength",
      sport: "Strength",
      minutes: 50,
      recurring: true,
    });
  if (weekday === 5)
    out.push({ title: "Easy run", sport: "Run", minutes: 35, recurring: true });
  if (weekday === 6) {
    out.push({
      title: "Long run",
      sport: "Run",
      minutes: t < Date.UTC(2026, 10, 1) ? 80 : 70,
      recurring: true,
    });
  }
  // A few one-off sessions near today, the way the owner plans by hand.
  if (index === 0) {
    out.push({ title: "Tempo run", sport: "Run", minutes: 45 });
    out.push({ title: "Hip mobility", sport: "Mobility", minutes: 15 });
  }
  if (index === 7)
    out.push({ title: "Intervals 6 × 800 m", sport: "Run", minutes: 50 });
  if (index === 14)
    out.push({ title: "Race-pace 3 km", sport: "Run", minutes: 35 });
  return out;
}

function buildWeeks() {
  // Weeks start on Monday; the first week starts on the Monday before today.
  const start = new Date(TODAY);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const weeks: Day[][] = [];
  for (let w = 0; w < WEEKS; w += 1) {
    const days: Day[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      const index = Math.round((date.getTime() - TODAY.getTime()) / 86_400_000);
      days.push({
        date,
        sessions: index < 0 ? [] : sessionsFor(date, index),
        recovery: date.getUTCDay() === 0,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

const fmtDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const fmtShort = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtMonth = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
}

function daysFromToday(date: Date) {
  return Math.round((date.getTime() - TODAY.getTime()) / 86_400_000);
}

export default function PlanPrototype() {
  if (process.env.NODE_ENV === "production") notFound();
  const weeks = buildWeeks();
  let lastPhase = "";

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1>Plan</h1>
        <nav className={s.chips} aria-label="Plan tools">
          <a href="#">Coach</a>
          <a href="#">Roadmap</a>
          <a href="#">Saved</a>
          <a href="#">Activities</a>
        </nav>
      </header>

      <nav className={s.months} aria-label="Jump to">
        <a href="#w0" data-current="true">
          This week
        </a>
        <a href="#w1">Next week</a>
        {["October", "November", "December"].map((m) => {
          const i = weeks.findIndex((w) => fmtMonth.format(w[3].date) === m);
          return (
            <a key={m} href={`#w${i}`}>
              {m.slice(0, 3)}
            </a>
          );
        })}
      </nav>

      {weeks.map((days, w) => {
        const first = days[0].date;
        const last = days[6].date;
        const phase =
          PHASES.find((p) => days[3].date.getTime() <= p.until) ?? PHASES[2];
        const showPhase = phase.name !== lastPhase;
        lastPhase = phase.name;
        const all = days.flatMap((d) => d.sessions);
        const minutes = all.reduce((sum, x) => sum + x.minutes, 0);
        const label =
          w === 0
            ? "This week"
            : w === 1
              ? "Next week"
              : `${fmtShort.format(first)} – ${fmtShort.format(last)}`;
        const beyond = daysFromToday(first) >= WRITTEN_DAYS;
        return (
          <section key={w} id={`w${w}`} className={s.weekWrap}>
            {showPhase ? (
              <div className={s.phase}>
                <span className={s.phaseName}>{phase.name}</span>
                <span className={s.phaseGoal}>{phase.goal}</span>
              </div>
            ) : null}
            <details className={s.week} open={w < 2}>
              <summary className={s.weekHead}>
                <span className={s.weekLabel}>{label}</span>
                <span className={s.weekSum}>
                  {all.length} sessions · {hours(minutes)}
                </span>
                <span className={s.weekBars} aria-hidden="true">
                  {days.map((d, i) => (
                    <span
                      key={i}
                      data-load={Math.min(
                        3,
                        Math.ceil(
                          d.sessions.reduce((a, x) => a + x.minutes, 0) / 30,
                        ),
                      )}
                      data-race={d.sessions.some((x) => x.race)}
                    />
                  ))}
                </span>
              </summary>
              <ol className={s.days}>
                {days.map((day) => {
                  const offset = daysFromToday(day.date);
                  const past = offset < 0;
                  return (
                    <li
                      key={day.date.toISOString()}
                      className={s.day}
                      data-today={offset === 0}
                      data-past={past}
                      data-empty={day.sessions.length === 0}
                    >
                      <div className={s.date}>
                        <span className={s.dow}>{fmtDay.format(day.date)}</span>
                        <span className={s.num}>{day.date.getUTCDate()}</span>
                      </div>
                      <div className={s.content}>
                        {day.sessions.length === 0 ? (
                          <div className={s.emptyLine}>
                            <span>
                              {day.recovery ? "Recovery day" : past ? "" : "—"}
                            </span>
                            {past ? null : (
                              <button
                                type="button"
                                className={s.add}
                                aria-label="Add a session"
                              >
                                +
                              </button>
                            )}
                          </div>
                        ) : (
                          day.sessions.map((x, i) => {
                            const repeat =
                              x.recurring && offset >= WRITTEN_DAYS;
                            return (
                              <a
                                key={i}
                                href="#"
                                className={s.card}
                                data-sport={x.sport}
                                data-repeat={repeat}
                                data-race={x.race === true}
                              >
                                <span className={s.cardTitle}>{x.title}</span>
                                <span className={s.cardMeta}>
                                  {x.recurring ? (
                                    <span className={s.loop} title="Repeats">
                                      ↻
                                    </span>
                                  ) : null}
                                  {x.minutes} min
                                </span>
                              </a>
                            );
                          })
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {beyond ? (
                <p className={s.note}>
                  Faint sessions repeat from a series and become real when you
                  get close.
                </p>
              ) : null}
            </details>
          </section>
        );
      })}
    </div>
  );
}
