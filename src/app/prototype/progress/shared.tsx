"use client";

/**
 * PROTOTYPE — the pieces every Progress variant draws: a small line chart, a
 * week of the plan as marks, the roadmap as a bar, and the app's frame.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import {
  allMilestones,
  currentPhaseIndex,
  dayDate,
  itemDate,
  itemStatus,
  itemTitle,
  phaseWeek,
  roadmap,
  shortDate,
  STATUS_LABELS,
  TODAY,
  toTime,
  type Outcome,
  type Point,
  type Series,
  type Week,
} from "./model";
import styles from "./progress-prototype.module.css";

export function Frame({
  children,
  title = "Progress",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className={styles.frame}>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1>{title}</h1>
          <p className={styles.asOf}>Lena’s record · as of {dayDate(TODAY)}</p>
        </header>
        {children}
      </main>
      <nav className={styles.nav} aria-label="Prototype navigation">
        {["Today", "Plan", "Progress", "You"].map((label) => (
          <span
            key={label}
            className={styles.navItem}
            data-active={label === "Progress" || undefined}
          >
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}

export function Section({
  label,
  title,
  children,
  aside,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={styles.section}>
      {label || title ? (
        <div className={styles.sectionHead}>
          <div>
            {label ? <p className={styles.label}>{label}</p> : null}
            {title ? <h2 className={styles.sectionTitle}>{title}</h2> : null}
          </div>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function AllLogsLink() {
  return (
    <Link className={styles.allLogs} href="/home/progress">
      <span>
        <strong>All logs</strong>
        <small>Today’s month-by-month record, one tap away</small>
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}

/** Where the prototype invents something the product does not have. */
export function Invented({ children }: { children: ReactNode }) {
  return <p className={styles.invented}>Not in FitTip yet: {children}</p>;
}

// ---- A small chart of logged values ----

export function Spark({
  series,
  target,
  height = 64,
  showDots = true,
  showAxis = false,
}: {
  series: Series;
  target?: number;
  height?: number;
  showDots?: boolean;
  showAxis?: boolean;
}) {
  const width = 300;
  const pad = 6;
  const values = series.points.map((p) => p.value);
  if (target !== undefined) values.push(target);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const t0 = toTime(series.first.date);
  const t1 = Math.max(toTime(series.last.date), t0 + 1);
  const x = (p: Point) =>
    pad + ((toTime(p.date) - t0) / (t1 - t0)) * (width - pad * 2);
  // Pace: lower is better, so it is drawn with the better value up.
  const y = (value: number) => {
    const share = (value - min) / (max - min);
    const up = series.lowerIsBetter ? share : 1 - share;
    return pad + up * (height - pad * 2);
  };
  const path = series.points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p).toFixed(1)},${y(p.value).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${series.name}: ${series.points.length} logs, from ${series.first.label} to ${series.last.label}`}
    >
      {target === undefined ? null : (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(target)}
          y2={y(target)}
          className={styles.sparkTarget}
        />
      )}
      <path d={path} className={styles.sparkLine} />
      {showDots
        ? series.points.map((p) => (
            <circle
              key={p.date}
              cx={x(p)}
              cy={y(p.value)}
              r={p === series.best ? 4 : 2.6}
              className={p === series.best ? styles.sparkBest : styles.sparkDot}
            />
          ))
        : null}
      {showAxis ? (
        <>
          <text x={pad} y={height - 1} className={styles.sparkAxis}>
            {shortDate(series.first.date)}
          </text>
          <text
            x={width - pad}
            y={height - 1}
            textAnchor="end"
            className={styles.sparkAxis}
          >
            {shortDate(series.last.date)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

// ---- A week of the plan ----

export function StatusMark({
  status,
  size = 22,
}: {
  status: Outcome | "no-log" | "open";
  size?: number;
}) {
  return (
    <span
      className={styles.mark}
      data-status={status}
      style={{ width: size, height: size }}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}

export function weekLabel(start: string) {
  return `${shortDate(start)}`;
}

export function WeekMarks({ week }: { week: Week }) {
  return (
    <span className={styles.weekMarks}>
      {week.items.map((item, index) => (
        <StatusMark key={index} status={itemStatus(item)} />
      ))}
    </span>
  );
}

export function WeekList({ week }: { week: Week }) {
  if (week.items.length === 0) {
    return <p className={styles.muted}>Nothing planned or logged.</p>;
  }
  return (
    <ol className={styles.weekList}>
      {week.items.map((item, index) => {
        const status = itemStatus(item);
        return (
          <li key={index}>
            <StatusMark status={status} size={18} />
            <span className={styles.weekListDay}>
              {dayDate(itemDate(item))}
            </span>
            <span className={styles.weekListTitle}>{itemTitle(item)}</span>
            <span className={styles.weekListStatus} data-status={status}>
              {STATUS_LABELS[status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Legend() {
  const shown: (Outcome | "no-log" | "open")[] = [
    "completed",
    "partially_completed",
    "replaced",
    "unplanned",
    "skipped",
    "no-log",
    "open",
  ];
  return (
    <ul className={styles.legend}>
      {shown.map((status) => (
        <li key={status}>
          <StatusMark status={status} size={12} />
          {STATUS_LABELS[status]}
        </li>
      ))}
    </ul>
  );
}

// ---- The roadmap as one bar ----

export function RoadmapBar({ compact = false }: { compact?: boolean }) {
  const start = toTime(roadmap.startDate);
  const end = toTime(roadmap.endDate);
  const at = (date: string) =>
    `${(((toTime(date) - start) / (end - start)) * 100).toFixed(2)}%`;
  const phaseIndex = currentPhaseIndex();
  const phase = roadmap.phases[phaseIndex];
  const weekOf = phase ? phaseWeek(phase) : null;

  return (
    <div className={styles.roadmap}>
      {compact ? null : (
        <p className={styles.roadmapTitle}>
          {phase && weekOf ? (
            <>
              Phase {phaseIndex + 1} of {roadmap.phases.length} ·{" "}
              <strong>{phase.title}</strong> · week {weekOf.current} of{" "}
              {weekOf.total}
            </>
          ) : (
            roadmap.title
          )}
        </p>
      )}
      <div className={styles.roadmapTrack}>
        {roadmap.phases.map((p, index) => (
          <span
            key={p.title}
            className={styles.roadmapPhase}
            data-current={index === phaseIndex || undefined}
            style={{
              left: at(p.startDate),
              width: `calc(${at(addOne(p.endDate))} - ${at(p.startDate)})`,
            }}
          >
            {compact ? null : <span>{p.title}</span>}
          </span>
        ))}
        {allMilestones().map((m) => (
          <span
            key={`${m.phaseIndex}-${m.title}`}
            className={styles.roadmapMilestone}
            data-reached={m.mark ? true : undefined}
            style={{ left: at(m.targetDate) }}
            title={`${m.title} · ${shortDate(m.targetDate)}`}
          />
        ))}
        <span className={styles.roadmapToday} style={{ left: at(TODAY) }} />
      </div>
      <div className={styles.roadmapEnds}>
        <span>{shortDate(roadmap.startDate)}</span>
        <span>{shortDate(roadmap.endDate)}</span>
      </div>
    </div>
  );
}

function addOne(date: string) {
  return new Date(toTime(date) + 86_400_000).toISOString().slice(0, 10);
}

/** A bar for each value, scaled to the largest. */
export function Bars({
  values,
  labels,
  ghost,
  height = 90,
}: {
  values: number[];
  labels: string[];
  ghost?: number[];
  height?: number;
}) {
  const max = Math.max(1, ...values, ...(ghost ?? []));
  return (
    <div className={styles.bars} style={{ height }}>
      {values.map((value, index) => (
        <div key={index} className={styles.barCol}>
          <div className={styles.barStack}>
            {ghost ? (
              <span
                className={styles.barGhost}
                style={{ height: `${(ghost[index] / max) * 100}%` }}
              />
            ) : null}
            <span
              className={styles.bar}
              style={{ height: `${(value / max) * 100}%` }}
            />
          </div>
          <span className={styles.barLabel}>{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}
