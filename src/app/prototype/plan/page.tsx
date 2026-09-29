/**
 * PROTOTYPE — the Plan as weeks over a three-month horizon, in two variants:
 * A scrolls through folded weeks, B pages one week at a time with arrows.
 * Sample data only, no account needed, nothing is saved. Throwaway: lives on
 * the prototype/plan-horizon branch and never merges to master.
 */

import Link from "next/link";
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
  if (weekday === 1) {
    out.push({ title: "Easy run", sport: "Run", minutes: 40, recurring: true });
  }
  if (weekday === 3) {
    out.push({
      title: "Lower body strength",
      sport: "Strength",
      minutes: 50,
      recurring: true,
    });
  }
  if (weekday === 5) {
    out.push({ title: "Easy run", sport: "Run", minutes: 35, recurring: true });
  }
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
  if (index === 7) {
    out.push({ title: "Intervals 6 × 800 m", sport: "Run", minutes: 50 });
  }
  if (index === 14) {
    out.push({ title: "Race-pace 3 km", sport: "Run", minutes: 35 });
  }
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
      const index = daysFromToday(date);
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

type Props = {
  searchParams: Promise<{ variant?: string; week?: string }>;
};

export default async function PlanPrototype({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const variant = params.variant === "pager" ? "pager" : "scroll";
  const weeks = buildWeeks();
  const week = Math.min(
    WEEKS - 1,
    Math.max(0, Number.parseInt(params.week ?? "0", 10) || 0),
  );

  return (
    <div className={s.root}>
      <nav className={s.switcher} aria-label="Prototype variant">
        <Link href="?variant=scroll" data-current={variant === "scroll"}>
          A · Scroll
        </Link>
        <Link href="?variant=pager" data-current={variant === "pager"}>
          B · Week by week
        </Link>
      </nav>
      <header className={s.header}>
        <h1>Plan</h1>
        <nav className={s.chips} aria-label="Plan tools">
          <a href="#">Coach</a>
          <a href="#">Roadmap</a>
          <a href="#">Saved</a>
          <a href="#">Activities</a>
        </nav>
      </header>
      {variant === "pager" ? (
        <Pager weeks={weeks} index={week} />
      ) : (
        <Scroll weeks={weeks} />
      )}
    </div>
  );
}

function weekFacts(days: Day[], w: number) {
  const first = days[0].date;
  const last = days[6].date;
  const phase =
    PHASES.find((p) => days[3].date.getTime() <= p.until) ?? PHASES[2];
  const all = days.flatMap((d) => d.sessions);
  const minutes = all.reduce((sum, x) => sum + x.minutes, 0);
  const range = `${fmtShort.format(first)} – ${fmtShort.format(last)}`;
  const label = w === 0 ? "This week" : w === 1 ? "Next week" : range;
  return { phase, count: all.length, minutes, label, range };
}

function Bars({ days, className }: { days: Day[]; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {days.map((d, i) => (
        <span
          key={i}
          data-load={Math.min(
            3,
            Math.ceil(d.sessions.reduce((a, x) => a + x.minutes, 0) / 30),
          )}
          data-race={d.sessions.some((x) => x.race)}
        />
      ))}
    </span>
  );
}

function Scroll({ weeks }: { weeks: Day[][] }) {
  let lastPhase = "";
  return (
    <>
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
        const { phase, count, minutes, label } = weekFacts(days, w);
        const showPhase = phase.name !== lastPhase;
        lastPhase = phase.name;
        return (
          <section key={w} id={`w${w}`} className={s.weekWrap}>
            {showPhase ? <Phase phase={phase} /> : null}
            <details className={s.week} open={w < 2}>
              <summary className={s.weekHead}>
                <span className={s.weekLabel}>{label}</span>
                <span className={s.weekSum}>
                  {count} sessions · {hours(minutes)}
                </span>
                <Bars days={days} className={s.weekBars} />
              </summary>
              <DayList days={days} />
            </details>
          </section>
        );
      })}
    </>
  );
}

function Pager({ weeks, index }: { weeks: Day[][]; index: number }) {
  const days = weeks[index];
  const { phase, count, minutes, label, range } = weekFacts(days, index);
  return (
    <>
      <Phase phase={phase} />
      <section className={s.pagerWeek}>
        <header className={s.pagerHead}>
          {index === 0 ? (
            <span className={s.arrow} aria-hidden="true" />
          ) : (
            <Link
              className={s.arrow}
              href={`?variant=pager&week=${index - 1}`}
              aria-label="Previous week"
              scroll={false}
            >
              ‹
            </Link>
          )}
          <div className={s.pagerTitle}>
            <span className={s.weekLabel}>{label}</span>
            {index < 2 ? <span className={s.weekSum}>{range}</span> : null}
            <span className={s.weekSum}>
              {count} sessions · {hours(minutes)}
            </span>
          </div>
          {index === weeks.length - 1 ? (
            <span className={s.arrow} aria-hidden="true" />
          ) : (
            <Link
              className={s.arrow}
              href={`?variant=pager&week=${index + 1}`}
              aria-label="Next week"
              scroll={false}
            >
              ›
            </Link>
          )}
        </header>
        <DayList days={days} />
      </section>

      <h2 className={s.aheadLabel}>Weeks ahead</h2>
      <nav className={s.tiles} aria-label="Weeks">
        {weeks.map((w, i) => (
          <Link
            key={i}
            href={`?variant=pager&week=${i}`}
            className={s.tile}
            aria-current={i === index ? "true" : undefined}
            scroll={false}
          >
            <span className={s.tileLabel}>
              {i === 0 ? "This wk" : fmtShort.format(w[0].date)}
            </span>
            <Bars days={w} className={s.tileBars} />
            <span className={s.tileSum}>{hours(weekFacts(w, i).minutes)}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

function Phase({ phase }: { phase: (typeof PHASES)[number] }) {
  return (
    <div className={s.phase}>
      <span className={s.phaseName}>{phase.name}</span>
      <span className={s.phaseGoal}>{phase.goal}</span>
    </div>
  );
}

function DayList({ days }: { days: Day[] }) {
  return (
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
          >
            <div className={s.date}>
              <span className={s.dow}>{fmtDay.format(day.date)}</span>
              <span className={s.num}>{day.date.getUTCDate()}</span>
            </div>
            <div className={s.content}>
              {day.sessions.length === 0 ? (
                <div className={s.emptyLine}>
                  <span>{day.recovery ? "Recovery day" : past ? "" : "—"}</span>
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
                day.sessions.map((x, i) => (
                  <a
                    key={i}
                    href="#"
                    className={s.card}
                    data-sport={x.sport}
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
                ))
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
