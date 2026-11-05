"use client";

/**
 * PROTOTYPE — five ways to redesign Progress, each answering "am I following
 * my plan?" and "is it working?" from Lena's real local record. Switch with
 * ?variant=A–E or the arrow keys. Nothing is saved; nothing is read live.
 */

import { useState } from "react";

import {
  activitiesOn,
  addDays,
  allMilestones,
  attentionFor,
  bestsBetween,
  coreGoals,
  currentPhaseIndex,
  dayDate,
  describeMeasurement,
  goalSeries,
  logs,
  logsForSports,
  mondayOf,
  recentWeeks,
  roadmap,
  series,
  shortDate,
  signalsSince,
  signalWords,
  SPORT_COLOURS,
  sportsInRecord,
  STATUS_LABELS,
  supportingGoals,
  TODAY,
  topActivities,
  untilText,
  week,
  weekdayLetter,
  type Goal,
  type Log,
  type Series,
  type Week,
} from "./model";
import styles from "./progress-prototype.module.css";
import {
  AllLogsLink,
  Bars,
  Frame,
  Invented,
  Legend,
  RoadmapBar,
  Section,
  Spark,
  StatusMark,
  WeekList,
  WeekMarks,
  weekLabel,
} from "./shared";

const SAFETY =
  "If a symptom is severe, sudden or getting worse, stop training and speak to a qualified health professional.";

export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
}

function nextMilestone() {
  return allMilestones().find((m) => !m.mark && m.targetDate >= TODAY) ?? null;
}

// ======================================================================
// A — One page of answers
// ======================================================================

export function VariantA() {
  const weeks = recentWeeks(8);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [openActivity, setOpenActivity] = useState<string | null>(null);
  const next = nextMilestone();
  const signals = signalsSince(addDays(TODAY, -42));
  const four = weeks.slice(-5, -1);
  const planned4 = four.reduce((sum, w) => sum + w.planned, 0);
  const logged4 = four.reduce((sum, w) => sum + w.logged, 0);

  return (
    <Frame>
      <Section label="Your goals">
        <ul className={styles.goalRows}>
          {coreGoals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </ul>
        <p className={styles.muted}>
          Also working on: {supportingGoals.map((g) => g.title).join(" · ")}
        </p>
        <Invented>
          the number beside each goal. Goals are free text, so nothing links “8
          Klimmzüge” to the Klimmzüge activity.
        </Invented>
      </Section>

      <Section label="Roadmap" title={roadmap.title}>
        <RoadmapBar />
        {next ? (
          <p className={styles.callout}>
            Next milestone: <strong>{next.title}</strong> ·{" "}
            {shortDate(next.targetDate)} ({untilText(next.targetDate)})
          </p>
        ) : null}
      </Section>

      <Section
        label="Following the plan"
        title={`${logged4} of ${planned4} planned sessions done in the last 4 weeks`}
      >
        <ol className={styles.weekRows}>
          {[...weeks].reverse().map((w) => (
            <li key={w.start}>
              <button
                type="button"
                className={styles.weekRow}
                onClick={() =>
                  setOpenWeek(openWeek === w.start ? null : w.start)
                }
                aria-expanded={openWeek === w.start}
              >
                <span className={styles.weekRowLabel}>
                  {w.start === mondayOf(TODAY)
                    ? "This week"
                    : weekLabel(w.start)}
                </span>
                <WeekMarks week={w} />
                <span className={styles.weekRowCount}>
                  {w.logged}/{w.planned}
                </span>
              </button>
              {openWeek === w.start ? <WeekList week={w} /> : null}
            </li>
          ))}
        </ol>
        <Legend />
      </Section>

      <Section label="Getting better at" title="Your most-logged activities">
        <div className={styles.activityGrid}>
          {topActivities.slice(0, 6).map(({ name }) => {
            const s = series(name);
            if (!s) return null;
            const open = openActivity === name;
            return (
              <button
                key={name}
                type="button"
                className={styles.activityCard}
                data-open={open || undefined}
                onClick={() => setOpenActivity(open ? null : name)}
                aria-expanded={open}
              >
                <span className={styles.activityName}>{name}</span>
                <Spark series={s} height={open ? 110 : 44} showAxis={open} />
                <span className={styles.activityBest}>
                  {s.bestLabel}: <strong>{s.best.label}</strong>
                </span>
                {open ? <History series={s} /> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Training time" title="Minutes logged per week">
        <Bars
          values={weeks.map((w) => w.loggedMinutes)}
          ghost={weeks.map((w) => w.plannedMinutes)}
          labels={weeks.map((w) => shortDate(w.start).split(" ")[0])}
        />
        <p className={styles.muted}>
          Solid: logged. Pale: planned. Logs without a duration are not counted.
        </p>
      </Section>

      <Section label="What you reported" title="Last 6 weeks">
        <SignalList signals={signals} />
      </Section>

      <AllLogsLink />
    </Frame>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  const linked = goalSeries(goal);
  const share = linked
    ? Math.min(1, linked.series.best.value / linked.link.target)
    : null;
  return (
    <li className={styles.goalRow}>
      <div className={styles.goalRowHead}>
        <strong>{goal.title}</strong>
        {goal.targetDate ? (
          <span className={styles.chip}>{untilText(goal.targetDate)}</span>
        ) : null}
      </div>
      {linked && share !== null ? (
        <>
          <div className={styles.meter}>
            <span style={{ width: `${share * 100}%` }} />
          </div>
          <p className={styles.goalRowFact}>
            {linked.series.bestLabel}:{" "}
            <strong>{linked.series.best.label}</strong> · target{" "}
            {linked.link.targetLabel}
          </p>
        </>
      ) : null}
    </li>
  );
}

export function History({ series: s }: { series: Series }) {
  return (
    <ol className={styles.history}>
      {[...s.points].reverse().map((p) => (
        <li key={p.date} data-best={p === s.best || undefined}>
          <span>{dayDate(p.date)}</span>
          <span>
            {p.label}
            {p === s.best ? " · best" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SignalList({ signals }: { signals: Log[] }) {
  if (signals.length === 0) {
    return <p className={styles.muted}>Nothing reported.</p>;
  }
  const pain = signals.filter((log) => log.pain);
  return (
    <div className={styles.signals}>
      {pain.length > 1 ? (
        <p>
          You reported <strong>pain</strong> on {pain.length} logs:{" "}
          {pain
            .map((log) => `${shortDate(log.date)} (${log.title})`)
            .join(", ")}
          .
        </p>
      ) : null}
      <ul>
        {signals
          .filter((log) => !(pain.length > 1 && log.pain))
          .map((log) => (
            <li key={log.date + log.title}>
              {shortDate(log.date)} · {log.title}: {signalWords(log).join(", ")}
            </li>
          ))}
      </ul>
      <p className={styles.safety}>{SAFETY}</p>
    </div>
  );
}

// ======================================================================
// B — Goal first
// ======================================================================

export function VariantB() {
  const phase = roadmap.phases[currentPhaseIndex()];
  const since = addDays(TODAY, -28);
  const goalSports = new Set(
    [...coreGoals, ...supportingGoals].flatMap((g) => g.sports),
  );
  const other = logs.filter(
    (log) => log.date >= since && !goalSports.has(log.sport),
  );

  return (
    <Frame title="Your goals">
      <p className={styles.lede}>
        Every core goal with the evidence for it: where the roadmap has it, what
        you have logged towards it, and what comes next.
      </p>
      {coreGoals.map((goal) => {
        const linked = goalSeries(goal);
        const level = attentionFor(goal.id, phase);
        const milestones = (() => {
          const all = allMilestones().filter((m) =>
            m.goalIds.includes(goal.id),
          );
          return all;
        })();
        const related = logsForSports(goal.sports)
          .filter((log) => log.outcome !== "skipped")
          .slice(-3)
          .reverse();
        return (
          <article key={goal.id} className={styles.goalCard}>
            <header className={styles.goalCardHead}>
              <p className={styles.label}>Core goal {goal.rank}</p>
              <h2>{goal.title}</h2>
              <p className={styles.goalOutcome}>{goal.outcome}</p>
              <div className={styles.chips}>
                {goal.targetDate ? (
                  <span className={styles.chip}>
                    {shortDate(goal.targetDate)} · {untilText(goal.targetDate)}
                  </span>
                ) : null}
                {level ? (
                  <span className={styles.chip} data-level={level}>
                    {level} in “{phase?.title}”
                  </span>
                ) : null}
              </div>
            </header>

            {linked ? (
              <div className={styles.goalChart}>
                <div className={styles.goalChartHead}>
                  <span>{linked.series.name}</span>
                  <span>
                    {linked.series.bestLabel.toLowerCase()}{" "}
                    <strong>{linked.series.best.label}</strong> / target{" "}
                    {linked.link.targetLabel}
                  </span>
                </div>
                <Spark
                  series={linked.series}
                  target={linked.link.target}
                  height={96}
                  showAxis
                />
                <p className={styles.muted}>
                  Dashed line: your target. First log{" "}
                  {linked.series.first.label} on{" "}
                  {shortDate(linked.series.first.date)}; latest{" "}
                  {linked.series.last.label}.
                </p>
              </div>
            ) : null}

            {milestones.length > 0 ? (
              <ol className={styles.milestones}>
                {milestones.map((m) => (
                  <li key={m.title} data-reached={m.mark ? true : undefined}>
                    <span className={styles.milestoneDot} />
                    <span>
                      <strong>{m.title}</strong>
                      <small>
                        {m.mark
                          ? `Marked reached ${shortDate(m.mark.reachedOn)}`
                          : `${shortDate(m.targetDate)} · ${untilText(m.targetDate)}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className={styles.related}>
              <p className={styles.label}>Latest {goal.sports.join(", ")}</p>
              <ul>
                {related.map((log) => (
                  <li key={log.date + log.title}>
                    <StatusMark status={log.outcome} size={14} />
                    {shortDate(log.date)} · {log.title}
                    {log.minutes ? ` · ${log.minutes} min` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
      <Invented>
        the chart and target on each card need a goal linked to an activity and
        a number. The milestones, dates and attention levels exist today.
      </Invented>

      <Section label="Supporting goals">
        <ul className={styles.supportRows}>
          {supportingGoals.map((goal) => {
            const recent = logsForSports(goal.sports).filter(
              (log) => log.date >= since && log.outcome !== "skipped",
            );
            return (
              <li key={goal.id}>
                <strong>{goal.title}</strong>
                <small>
                  {recent.length} {goal.sports.join("/")} session
                  {recent.length === 1 ? "" : "s"} in the last 4 weeks
                </small>
              </li>
            );
          })}
        </ul>
      </Section>

      {other.length > 0 ? (
        <Section label="Not tied to a goal">
          <ul className={styles.supportRows}>
            {other.map((log) => (
              <li key={log.date + log.title}>
                <strong>{log.title}</strong>
                <small>
                  {shortDate(log.date)} · {log.sport}
                  {log.minutes ? ` · ${log.minutes} min` : ""}
                </small>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <AllLogsLink />
    </Frame>
  );
}

// ======================================================================
// C — Tabs
// ======================================================================

const TABS = ["Overview", "Plan", "Activities", "Log"] as const;

export function VariantC() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [sheet, setSheet] = useState<string | null>(null);
  const weeks = recentWeeks(12);
  const thisWeek = weeks[weeks.length - 1];
  const four = weeks.slice(-5, -1);
  const next = nextMilestone();
  const s = sheet ? series(sheet) : null;

  return (
    <Frame>
      <div className={styles.tabs} role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={styles.tab}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <>
          <div className={styles.tiles}>
            <Tile
              label="This week"
              value={`${thisWeek.logged} done`}
              detail={`${thisWeek.items.filter((i) => i.kind === "planned" && i.status === "open").length} still coming up`}
            />
            <Tile
              label="Last 4 weeks"
              value={`${four.reduce((a, w) => a + w.logged, 0)} of ${four.reduce((a, w) => a + w.planned, 0)}`}
              detail="planned sessions done"
            />
            <Tile
              label="Training time, 4 weeks"
              value={hours(four.reduce((a, w) => a + w.loggedMinutes, 0))}
              detail={`of ${hours(four.reduce((a, w) => a + w.plannedMinutes, 0))} planned`}
            />
            <Tile
              label="Next milestone"
              value={next ? untilText(next.targetDate) : "—"}
              detail={next?.title ?? "None open"}
            />
          </div>
          <Section label="Roadmap">
            <RoadmapBar />
          </Section>
          <Section label="Bests in the last 4 weeks">
            <ul className={styles.bestList}>
              {bestsBetween(addDays(TODAY, -28), TODAY).map((b) => (
                <li key={b.name + b.point.date}>
                  <strong>{b.name}</strong>
                  <span>
                    {b.point.label}{" "}
                    <small>
                      {shortDate(b.point.date)} · was {b.previous.label}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}

      {tab === "Plan" ? (
        <>
          <Legend />
          {[...weeks].reverse().map((w) => (
            <Section
              key={w.start}
              label={`Week of ${shortDate(w.start)}`}
              aside={
                <span className={styles.chip}>
                  {w.logged}/{w.planned} done
                </span>
              }
            >
              <WeekList week={w} />
            </Section>
          ))}
        </>
      ) : null}

      {tab === "Activities" ? (
        <ul className={styles.activityList}>
          {topActivities.map(({ name, count }) => {
            const a = series(name);
            if (!a) return null;
            return (
              <li key={name}>
                <button
                  type="button"
                  className={styles.activityRow}
                  onClick={() => setSheet(name)}
                >
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {count} logs · latest {a.last.label}
                    </small>
                  </span>
                  <span className={styles.activityRowSpark}>
                    <Spark series={a} height={34} showDots={false} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "Log" ? (
        <ol className={styles.logList}>
          {[...logs]
            .reverse()
            .slice(0, 20)
            .map((log) => (
              <li key={log.date + log.title}>
                <StatusMark status={log.outcome} size={18} />
                <span>
                  <strong>{log.title}</strong>
                  <small>
                    {dayDate(log.date)} · {STATUS_LABELS[log.outcome]}
                    {log.minutes ? ` · ${log.minutes} min` : ""}
                    {log.effort ? ` · effort ${log.effort}/10` : ""}
                  </small>
                </span>
              </li>
            ))}
        </ol>
      ) : null}

      {s ? (
        <div className={styles.sheetBackdrop} onClick={() => setSheet(null)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-label={s.name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <h2>{s.name}</h2>
              <button type="button" onClick={() => setSheet(null)}>
                Close
              </button>
            </div>
            <Spark series={s} height={140} showAxis />
            <div className={styles.tiles}>
              <Tile
                label={s.bestLabel}
                value={s.best.label}
                detail={shortDate(s.best.date)}
              />
              <Tile
                label="First logged"
                value={s.first.label}
                detail={shortDate(s.first.date)}
              />
            </div>
            <History series={s} />
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

export function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

// ======================================================================
// D — Week review
// ======================================================================

export function VariantD() {
  // The last full week by default: the current one is still half open.
  const [start, setStart] = useState(addDays(mondayOf(TODAY), -7));
  const w = week(start);
  const before = week(addDays(start, -7));
  const end = addDays(start, 6);
  const bests = bestsBetween(start, end);
  const weekLogs = logs.filter((l) => l.date >= start && l.date <= end);
  const efforts = weekLogs.filter((l) => l.effort !== null);
  const upcoming = allMilestones().filter(
    (m) => !m.mark && m.targetDate > end && m.targetDate <= addDays(end, 35),
  );
  const canGoForward = start < mondayOf(TODAY);

  return (
    <Frame title="Week review">
      <header className={styles.weekPicker}>
        <button
          type="button"
          onClick={() => setStart(addDays(start, -7))}
          aria-label="Previous week"
        >
          ‹
        </button>
        <h2>
          {shortDate(start)} – {shortDate(end)}
          {start === mondayOf(TODAY) ? <small>This week</small> : null}
        </h2>
        <button
          type="button"
          onClick={() => setStart(addDays(start, 7))}
          disabled={!canGoForward}
          aria-label="Next week"
        >
          ›
        </button>
      </header>

      <div className={styles.compare}>
        <Compare
          label="Planned sessions done"
          now={`${w.logged} of ${w.planned}`}
          then={`${before.logged} of ${before.planned}`}
        />
        <Compare
          label="Training time"
          now={hours(w.loggedMinutes)}
          then={hours(before.loggedMinutes)}
          extra={`${hours(w.plannedMinutes)} planned`}
        />
        <Compare
          label="Effort you logged, out of 10"
          now={
            efforts.length
              ? efforts.map((l) => l.effort).join(" · ")
              : "none given"
          }
          then=""
        />
      </div>

      <Section label="The week as planned">
        <WeekList week={w} />
      </Section>

      <Section label="By sport">
        <SportSplit week={w} />
      </Section>

      <Section label="New bests this week">
        {bests.length === 0 ? (
          <p className={styles.muted}>
            None of your logged values beat an earlier one this week.
          </p>
        ) : (
          <ul className={styles.bestList}>
            {bests.map((b) => (
              <li key={b.name + b.point.date}>
                <strong>{b.name}</strong>
                <span>
                  {b.point.label} <small>was {b.previous.label}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {w.signals.length > 0 ? (
        <Section label="What you reported">
          <SignalList signals={w.signals} />
        </Section>
      ) : null}

      <Section label="Coming up on the roadmap">
        {upcoming.length === 0 ? (
          <p className={styles.muted}>No milestone in the next five weeks.</p>
        ) : (
          <ul className={styles.supportRows}>
            {upcoming.map((m) => (
              <li key={m.title}>
                <strong>{m.title}</strong>
                <small>
                  {shortDate(m.targetDate)} · {m.phaseTitle}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <AllLogsLink />
    </Frame>
  );
}

function Compare({
  label,
  now,
  then,
  extra,
}: {
  label: string;
  now: string;
  then: string;
  extra?: string;
}) {
  return (
    <div className={styles.compareRow}>
      <span className={styles.label}>{label}</span>
      <strong>{now}</strong>
      <small>
        {then ? `week before: ${then}` : ""}
        {extra ? `${then ? " · " : ""}${extra}` : ""}
      </small>
    </div>
  );
}

function SportSplit({ week: w }: { week: Week }) {
  const total = Object.values(w.minutesBySport).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className={styles.muted}>No minutes logged.</p>;
  return (
    <>
      <div className={styles.split}>
        {Object.entries(w.minutesBySport).map(([sport, minutes]) => (
          <span
            key={sport}
            style={{
              flexGrow: minutes,
              background: SPORT_COLOURS[sport] ?? "var(--moss)",
            }}
          />
        ))}
      </div>
      <ul className={styles.splitLegend}>
        {Object.entries(w.minutesBySport).map(([sport, minutes]) => (
          <li key={sport}>
            <i style={{ background: SPORT_COLOURS[sport] ?? "var(--moss)" }} />
            {sport} {hours(minutes)}
          </li>
        ))}
      </ul>
    </>
  );
}

// ======================================================================
// E — Calendar
// ======================================================================

export function VariantE() {
  const weeks = recentWeeks(12);
  const [day, setDay] = useState<string>(addDays(TODAY, -1));
  const dayLogs = logs.filter((l) => l.date === day);
  const dayItems = weeks
    .flatMap((w) => w.items)
    .filter(
      (item) =>
        (item.kind === "planned" ? item.session.date : item.log.date) === day,
    );
  const first = weeks[0].start;
  const inRange = logs.filter(
    (l) => l.date >= first && l.outcome !== "skipped",
  );

  return (
    <Frame>
      <Section label="12 weeks" title="Every planned and logged session">
        <div className={styles.calendar}>
          <span />
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={styles.calendarHead}>
              {weekdayLetter(addDays(weeks[0].start, i))}
            </span>
          ))}
          {weeks.map((w) => (
            <CalendarWeek
              key={w.start}
              week={w}
              selected={day}
              onPick={setDay}
            />
          ))}
        </div>
        <Legend />
      </Section>

      <Section label={dayDate(day)}>
        {dayItems.length === 0 ? (
          <p className={styles.muted}>Nothing planned or logged.</p>
        ) : (
          <ul className={styles.dayDetail}>
            {dayItems.map((item, index) => {
              const status =
                item.kind === "planned" ? item.status : "unplanned";
              const log =
                item.kind === "unplanned"
                  ? item.log
                  : dayLogs.find((l) => l.title === item.session.title);
              return (
                <li key={index}>
                  <div className={styles.dayDetailHead}>
                    <StatusMark status={status} size={18} />
                    <strong>
                      {item.kind === "planned"
                        ? item.session.title
                        : item.log.title}
                    </strong>
                    <span
                      className={styles.weekListStatus}
                      data-status={status}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  {log ? (
                    <small>
                      {log.minutes ? `${log.minutes} min` : "no duration"}
                      {log.effort ? ` · effort ${log.effort}/10` : ""}
                      {signalWords(log).length
                        ? ` · reported ${signalWords(log).join(", ")}`
                        : ""}
                    </small>
                  ) : null}
                </li>
              );
            })}
            {activitiesOn(day).map((a) => (
              <li key={a.name} className={styles.dayActivity}>
                {a.name}
                <small>{describeMeasurement(a)}</small>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="12 weeks by sport">
        <ul className={styles.sportTotals}>
          {sportsInRecord.map((sport) => {
            const ofSport = inRange.filter((l) => l.sport === sport);
            if (ofSport.length === 0) return null;
            const minutes = ofSport.reduce((a, l) => a + (l.minutes ?? 0), 0);
            return (
              <li key={sport}>
                <i
                  style={{ background: SPORT_COLOURS[sport] ?? "var(--moss)" }}
                />
                <strong>{sport}</strong>
                <span>
                  {ofSport.length} sessions · {hours(minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>
      <AllLogsLink />
    </Frame>
  );
}

function CalendarWeek({
  week: w,
  selected,
  onPick,
}: {
  week: Week;
  selected: string;
  onPick: (day: string) => void;
}) {
  return (
    <>
      <span className={styles.calendarWeek}>{shortDate(w.start)}</span>
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(w.start, i);
        const items = w.items.filter(
          (item) =>
            (item.kind === "planned" ? item.session.date : item.log.date) ===
            date,
        );
        return (
          <button
            key={date}
            type="button"
            className={styles.calendarDay}
            data-selected={date === selected || undefined}
            data-today={date === TODAY || undefined}
            onClick={() => onPick(date)}
            aria-label={`${dayDate(date)}: ${items.length} sessions`}
          >
            {items.map((item, index) => (
              <StatusMark
                key={index}
                status={item.kind === "planned" ? item.status : "unplanned"}
                size={items.length > 1 ? 9 : 14}
              />
            ))}
          </button>
        );
      })}
    </>
  );
}
