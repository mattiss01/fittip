"use client";

/**
 * PROTOTYPE — the owner's round of 5 Nov 2026: B's goal cards and C's tabs,
 * and Progress split by sport. F splits the whole page by sport; G keeps C's
 * tabs with every goal as a card, and shows what choosing how a goal is
 * measured would look like. Nothing chosen here is saved.
 */

import { useState } from "react";

import {
  addDays,
  allMilestones,
  attentionFor,
  activitiesBySport,
  bestsBetween,
  currentPhaseIndex,
  dayDate,
  goals,
  goalsForSport,
  GOAL_LINKS,
  logs,
  logsForSports,
  METRIC_WORDS,
  metricsFor,
  mondayOf,
  recentWeeks,
  roadmap,
  series,
  shortDate,
  signalsSince,
  SPORT_COLOURS,
  sportsByUse,
  STATUS_LABELS,
  TODAY,
  untilText,
  type Goal,
  type Metric,
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
import { History, hours, SignalList, Tile } from "./variants";

// ---- How a goal is measured: a choice the product does not have ----

type Measure =
  | { kind: "activity"; activity: string; metric: Metric; target: number }
  | { kind: "frequency"; sport: string; perWeek: number }
  | { kind: "none" };

const STARTING_MEASURES: Record<string, Measure> = Object.fromEntries(
  Object.entries(GOAL_LINKS)
    // The half marathon is left open in G, so the picker has something to do.
    .filter(([, link]) => link.activity !== "Dauerlauf locker")
    .map(([id, link]) => [
      id,
      {
        kind: "activity",
        activity: link.activity,
        metric: link.metric,
        target: link.target,
      },
    ]),
);

function sportColour(sport: string) {
  return SPORT_COLOURS[sport] ?? "var(--moss)";
}

// ---- One goal as a card ----

function GoalCard({
  goal,
  measure,
  onMeasure,
  compact = false,
}: {
  goal: Goal;
  measure: Measure | undefined;
  onMeasure?: () => void;
  compact?: boolean;
}) {
  const phase = roadmap.phases[currentPhaseIndex()];
  const level = attentionFor(goal.id, phase);
  const milestones = allMilestones().filter((m) => m.goalIds.includes(goal.id));
  const related = logsForSports(goal.sports)
    .filter((log) => log.outcome !== "skipped")
    .slice(-3)
    .reverse();

  return (
    <article className={styles.goalCard}>
      <header className={styles.goalCardHead}>
        <p className={styles.label}>
          {goal.tier === "core" ? `Core goal ${goal.rank}` : "Supporting goal"}
        </p>
        <h2>{goal.title}</h2>
        {compact ? null : <p className={styles.goalOutcome}>{goal.outcome}</p>}
        <div className={styles.chips}>
          {goal.sports.map((sport) => (
            <span
              key={sport}
              className={styles.chip}
              style={{ boxShadow: `inset 3px 0 0 ${sportColour(sport)}` }}
            >
              {sport}
            </span>
          ))}
          {goal.targetDate ? (
            <span className={styles.chip}>
              {shortDate(goal.targetDate)} · {untilText(goal.targetDate)}
            </span>
          ) : null}
          {level ? (
            <span className={styles.chip} data-level={level}>
              {level} now
            </span>
          ) : null}
        </div>
      </header>

      <MeasureView measure={measure} onMeasure={onMeasure} />

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

      {compact ? null : (
        <div className={styles.related}>
          <p className={styles.label}>Latest {goal.sports.join(", ")}</p>
          {related.length === 0 ? (
            <p className={styles.muted}>Nothing logged yet.</p>
          ) : (
            <ul>
              {related.map((log) => (
                <li key={log.date + log.title}>
                  <StatusMark status={log.outcome} size={14} />
                  {shortDate(log.date)} · {log.title}
                  {log.minutes ? ` · ${log.minutes} min` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function MeasureView({
  measure,
  onMeasure,
}: {
  measure: Measure | undefined;
  onMeasure?: () => void;
}) {
  const change = onMeasure ? (
    <button type="button" className={styles.linkButton} onClick={onMeasure}>
      {measure ? "Change how it is measured" : "Choose how it is measured"}
    </button>
  ) : null;

  if (measure === undefined) {
    return onMeasure ? (
      <div className={styles.measureEmpty}>
        <p className={styles.muted}>
          No number is tracked for this goal. Its milestones and sessions are
          below.
        </p>
        {change}
      </div>
    ) : null;
  }
  if (measure.kind === "none") {
    return (
      <div className={styles.measureEmpty}>
        <p className={styles.muted}>
          You said FitTip cannot measure this one. It shows its milestones and
          sessions.
        </p>
        {change}
      </div>
    );
  }
  if (measure.kind === "frequency") {
    const weeks = recentWeeks(8, measure.sport);
    const counts = weeks.map(
      (w) =>
        logs.filter(
          (l) =>
            l.sport === measure.sport &&
            l.outcome !== "skipped" &&
            l.date >= w.start &&
            l.date <= addDays(w.start, 6),
        ).length,
    );
    const met = counts.slice(0, -1).filter((c) => c >= measure.perWeek).length;
    return (
      <div className={styles.goalChart}>
        <div className={styles.goalChartHead}>
          <span>{measure.sport} sessions a week</span>
          <span>
            target <strong>{measure.perWeek}</strong>
          </span>
        </div>
        <Bars
          values={counts}
          ghost={counts.map(() => measure.perWeek)}
          labels={weeks.map((w) => shortDate(w.start).split(" ")[0])}
          height={70}
        />
        <p className={styles.muted}>
          {met} of the last {counts.length - 1} full weeks had {measure.perWeek}{" "}
          or more. Pale: your target.
        </p>
        {change}
      </div>
    );
  }
  const s = series(measure.activity, measure.metric);
  if (!s) return null;
  const targetLabel =
    measure.metric === "load"
      ? `${measure.target} kg`
      : measure.metric === "distance"
        ? `${measure.target} km`
        : measure.metric === "minutes"
          ? `${measure.target} min`
          : String(measure.target);
  return (
    <div className={styles.goalChart}>
      <div className={styles.goalChartHead}>
        <span>{s.name}</span>
        <span>
          {s.bestLabel.toLowerCase()} <strong>{s.best.label}</strong> / target{" "}
          {targetLabel}
        </span>
      </div>
      <Spark series={s} target={measure.target} height={90} showAxis />
      <p className={styles.muted}>
        Dashed line: your target. First {s.first.label}, latest {s.last.label}.
      </p>
      {change}
    </div>
  );
}

// ---- The measure picker (G) ----

function MeasureSheet({
  goal,
  current,
  onSave,
  onClose,
}: {
  goal: Goal;
  current: Measure | undefined;
  onSave: (measure: Measure) => void;
  onClose: () => void;
}) {
  const own = goal.sports.flatMap((sport) =>
    activitiesBySport(sport).map((a) => a.name),
  );
  const others = activitiesBySport()
    .map((a) => a.name)
    .filter((name) => !own.includes(name));
  const [kind, setKind] = useState<Measure["kind"]>(
    current?.kind ?? "activity",
  );
  const [activity, setActivity] = useState(
    current?.kind === "activity" ? current.activity : (own[0] ?? others[0]),
  );
  const [metric, setMetric] = useState<Metric>(
    current?.kind === "activity" ? current.metric : metricsFor(activity)[0],
  );
  const [target, setTarget] = useState(
    current?.kind === "activity" ? String(current.target) : "",
  );
  const [sport, setSport] = useState(
    current?.kind === "frequency" ? current.sport : goal.sports[0],
  );
  const [perWeek, setPerWeek] = useState(
    current?.kind === "frequency" ? String(current.perWeek) : "3",
  );
  const metrics = metricsFor(activity);
  const ready =
    kind === "none" ||
    (kind === "activity" && Number(target) > 0) ||
    (kind === "frequency" && Number(perWeek) > 0);

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-label={`How “${goal.title}” is measured`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.sheetHead}>
          <h2>How is this measured?</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className={styles.muted}>
          <strong>{goal.title}</strong> — {goal.outcome}
        </p>
        <div className={styles.choiceList} role="radiogroup">
          {(
            [
              ["activity", "By an activity I log"],
              ["frequency", "By how often I train"],
              ["none", "FitTip can’t measure this"],
            ] as const
          ).map(([value, words]) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                name="kind"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {words}
            </label>
          ))}
        </div>

        {kind === "activity" ? (
          <div className={styles.fields}>
            <label>
              Activity
              <select
                value={activity}
                onChange={(event) => {
                  setActivity(event.target.value);
                  setMetric(metricsFor(event.target.value)[0]);
                }}
              >
                <optgroup label={`In ${goal.sports.join(", ")}`}>
                  {own.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label="Other activities">
                  {others.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Measured by
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as Metric)}
              >
                {metrics.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_WORDS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target
              <input
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="e.g. 21.1"
              />
            </label>
          </div>
        ) : null}

        {kind === "frequency" ? (
          <div className={styles.fields}>
            <label>
              Sport
              <select
                value={sport}
                onChange={(event) => setSport(event.target.value)}
              >
                {sportsByUse.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Sessions a week
              <input
                inputMode="numeric"
                value={perWeek}
                onChange={(event) => setPerWeek(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          className={styles.primary}
          disabled={!ready}
          onClick={() =>
            onSave(
              kind === "activity"
                ? { kind, activity, metric, target: Number(target) }
                : kind === "frequency"
                  ? { kind, sport, perWeek: Number(perWeek) }
                  : { kind: "none" },
            )
          }
        >
          Show it on the goal
        </button>
        <Invented>
          this choice. It would be stored on the goal (a migration), and could
          be suggested by the coach when it suggests a goal.
        </Invented>
      </div>
    </div>
  );
}

function ActivitySheet({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const s = series(name);
  if (!s) return null;
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-label={s.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.sheetHead}>
          <h2>{s.name}</h2>
          <button type="button" onClick={onClose}>
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
  );
}

function ActivityRows({
  sport,
  onOpen,
}: {
  sport?: string;
  onOpen: (name: string) => void;
}) {
  const list = activitiesBySport(sport);
  if (list.length === 0) {
    return <p className={styles.muted}>No measured activities.</p>;
  }
  return (
    <ul className={styles.activityList}>
      {list.map(({ name, count }) => {
        const a = series(name);
        if (!a) return null;
        return (
          <li key={name}>
            <button
              type="button"
              className={styles.activityRow}
              onClick={() => onOpen(name)}
            >
              <span>
                <strong>{name}</strong>
                <small>
                  {count} logs · {a.bestLabel.toLowerCase()} {a.best.label}
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
  );
}

// ======================================================================
// F — By sport
// ======================================================================

export function VariantF() {
  const [sport, setSport] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  return (
    <Frame>
      <div className={styles.sportChips} role="tablist">
        {[null, ...sportsByUse].map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            role="tab"
            aria-selected={sport === s}
            className={styles.sportChip}
            style={s ? { ["--sport" as string]: sportColour(s) } : undefined}
            onClick={() => setSport(s)}
          >
            {s ? <i /> : null}
            {s ?? "All"}
          </button>
        ))}
      </div>

      {sport === null ? (
        <AllSports onPick={setSport} />
      ) : (
        <OneSport sport={sport} onOpen={setSheet} />
      )}

      {sheet ? (
        <ActivitySheet name={sheet} onClose={() => setSheet(null)} />
      ) : null}
      <AllLogsLink />
    </Frame>
  );
}

function AllSports({ onPick }: { onPick: (sport: string) => void }) {
  const weeks = recentWeeks(5);
  const four = weeks.slice(0, -1);
  return (
    <>
      <div className={styles.tiles}>
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
      </div>
      <Section label="Roadmap">
        <RoadmapBar />
      </Section>
      {sportsByUse.map((sport) => {
        const sportWeeks = recentWeeks(8, sport);
        const recent = sportWeeks.slice(-5, -1);
        const done = recent.reduce((a, w) => a + w.logged, 0);
        const planned = recent.reduce((a, w) => a + w.planned, 0);
        const minutes = recent.reduce((a, w) => a + w.loggedMinutes, 0);
        const sportGoals = goalsForSport(sport);
        const bests = bestsBetween(addDays(TODAY, -28), TODAY, sport);
        return (
          <button
            key={sport}
            type="button"
            className={styles.sportCard}
            style={{ ["--sport" as string]: sportColour(sport) }}
            onClick={() => onPick(sport)}
          >
            <span className={styles.sportCardHead}>
              <strong>{sport}</strong>
              <span>›</span>
            </span>
            <span className={styles.sportCardFacts}>
              {planned > 0
                ? `${done} of ${planned} planned done`
                : "Nothing planned"}{" "}
              · {hours(minutes)} in 4 weeks
            </span>
            {sportGoals.length > 0 ? (
              <span className={styles.sportCardGoals}>
                {sportGoals.map((g) => (
                  <span key={g.id}>
                    {g.tier === "core" ? "◆" : "◇"} {g.title}
                  </span>
                ))}
              </span>
            ) : (
              <span className={styles.muted}>No goal names {sport}.</span>
            )}
            {bests.length > 0 ? (
              <span className={styles.sportCardBest}>
                New best: {bests[0].name} {bests[0].point.label}
                {bests.length > 1 ? ` +${bests.length - 1} more` : ""}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

function OneSport({
  sport,
  onOpen,
}: {
  sport: string;
  onOpen: (name: string) => void;
}) {
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const weeks = recentWeeks(8, sport);
  const sportGoals = goalsForSport(sport);
  const bests = bestsBetween(addDays(TODAY, -28), TODAY, sport);
  const signals = signalsSince(addDays(TODAY, -42)).filter(
    (log) => log.sport === sport,
  );

  return (
    <>
      {sportGoals.length > 0 ? (
        sportGoals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            measure={STARTING_MEASURES[goal.id]}
            compact
          />
        ))
      ) : (
        <Section label="Goals">
          <p className={styles.muted}>No goal names {sport}.</p>
        </Section>
      )}

      <Section label={`${sport} in the plan`}>
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
                  {w.planned > 0 ? `${w.logged}/${w.planned}` : ""}
                </span>
              </button>
              {openWeek === w.start ? <WeekList week={w} /> : null}
            </li>
          ))}
        </ol>
        <Legend />
      </Section>

      <Section label="Minutes per week">
        <Bars
          values={weeks.map((w) => w.loggedMinutes)}
          ghost={weeks.map((w) => w.plannedMinutes)}
          labels={weeks.map((w) => shortDate(w.start).split(" ")[0])}
        />
        <p className={styles.muted}>Solid: logged. Pale: planned.</p>
      </Section>

      <Section label="Activities">
        <ActivityRows sport={sport} onOpen={onOpen} />
      </Section>

      {bests.length > 0 ? (
        <Section label="New bests, last 4 weeks">
          <ul className={styles.bestList}>
            {bests.map((b) => (
              <li key={b.name}>
                <strong>{b.name}</strong>
                <span>
                  {b.point.label} <small>was {b.previous.label}</small>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {signals.length > 0 ? (
        <Section label="What you reported">
          <SignalList signals={signals} />
        </Section>
      ) : null}
    </>
  );
}

// ======================================================================
// G — Goals + tabs
// ======================================================================

const TABS = ["Goals", "Plan", "Activities", "Log"] as const;

export function VariantG() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Goals");
  const [measures, setMeasures] =
    useState<Record<string, Measure>>(STARTING_MEASURES);
  const [picking, setPicking] = useState<Goal | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const weeks = recentWeeks(8);

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

      {tab === "Goals" ? (
        <>
          <Section label="Roadmap">
            <RoadmapBar />
          </Section>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              measure={measures[goal.id]}
              onMeasure={() => setPicking(goal)}
            />
          ))}
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

      {tab === "Activities"
        ? sportsByUse.map((sport) =>
            activitiesBySport(sport).length === 0 ? null : (
              <Section
                key={sport}
                label={sport}
                aside={
                  <i
                    className={styles.sportDot}
                    style={{ background: sportColour(sport) }}
                  />
                }
              >
                <ActivityRows sport={sport} onOpen={setSheet} />
              </Section>
            ),
          )
        : null}

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
                  </small>
                </span>
              </li>
            ))}
        </ol>
      ) : null}

      {picking ? (
        <MeasureSheet
          goal={picking}
          current={measures[picking.id]}
          onClose={() => setPicking(null)}
          onSave={(measure) => {
            setMeasures({ ...measures, [picking.id]: measure });
            setPicking(null);
          }}
        />
      ) : null}
      {sheet ? (
        <ActivitySheet name={sheet} onClose={() => setSheet(null)} />
      ) : null}
    </Frame>
  );
}
