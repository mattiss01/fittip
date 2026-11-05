/**
 * PROTOTYPE — everything the Progress variants compute, from one athlete's
 * exported local record (Lena, `lena.json`). Pure functions over static data:
 * no account, no read, nothing saved. The goal links at the bottom do not exist
 * in the product; they are hand-set here to show what such a link would buy.
 */

import raw from "./lena.json";

export type Outcome =
  | "completed"
  | "partially_completed"
  | "skipped"
  | "replaced"
  | "unplanned";

export type Log = {
  date: string;
  outcome: Outcome;
  title: string;
  sport: string;
  minutes: number | null;
  effort: number | null;
  pain: boolean;
  illness: boolean;
  injury: boolean;
  fatigue: boolean;
  planned: boolean;
};

type Group = { sets: number; reps?: number; seconds?: number; load?: number };

export type Measurement = {
  sets?: number;
  reps?: number;
  load?: number;
  load_unit?: string;
  groups?: Group[];
  distance?: number;
  distance_unit?: string;
  duration_seconds?: number;
  pace_seconds_per_unit?: number;
  duration_minutes?: number;
  intensity?: string;
};

export type ActivityLog = {
  date: string;
  name: string;
  mode: string;
  measurement: Measurement;
};

export type PlanSession = {
  date: string;
  title: string;
  sport: string;
  minutes: number | null;
  outcome: Outcome | null;
};

export type Goal = {
  id: string;
  title: string;
  outcome: string;
  tier: "core" | "supporting";
  targetDate: string | null;
  sports: string[];
  rank: number;
};

export type Milestone = {
  title: string;
  goalIds: string[];
  targetDate: string;
  criterion: string | null;
};

export type Phase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  milestones: Milestone[];
  attention: { goalId: string; level: string }[];
};

const data = raw as unknown as {
  logs: Log[];
  activities: ActivityLog[];
  sessions: PlanSession[];
  goals: Goal[];
  roadmap: {
    title: string;
    startDate: string;
    endDate: string;
    phases: Phase[];
  };
  marks: { phase: number; milestone: number; reachedOn: string }[];
};

/** The prototype's "today": the day after Lena's last log. */
export const TODAY = "2026-10-21";

export const logs = data.logs;
export const activities = data.activities;
export const sessions = data.sessions;
export const goals = [...data.goals].sort((a, b) =>
  a.tier === b.tier ? a.rank - b.rank : a.tier === "core" ? -1 : 1,
);
export const coreGoals = goals.filter((goal) => goal.tier === "core");
export const supportingGoals = goals.filter(
  (goal) => goal.tier === "supporting",
);
export const roadmap = data.roadmap;
export const marks = data.marks;

// ---- Dates ----

const DAY_MS = 86_400_000;

export function toTime(date: string) {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number) {
  return new Date(toTime(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toTime(to) - toTime(from)) / DAY_MS);
}

export function mondayOf(date: string) {
  const weekday = (new Date(toTime(date)).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

const SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const WEEKDAY_LETTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "narrow",
  timeZone: "UTC",
});

export const shortDate = (date: string) => SHORT.format(toTime(date));
export const dayDate = (date: string) => WEEKDAY_SHORT.format(toTime(date));
export const weekdayLetter = (date: string) =>
  WEEKDAY_LETTER.format(toTime(date));

/** "in 12 weeks", "in 5 days", "today" — a countdown, never a judgement. */
export function untilText(date: string) {
  const days = daysBetween(TODAY, date);
  if (days === 0) return "today";
  if (days < 0) return `${shortDate(date)}, passed`;
  if (days < 14) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `in ${Math.round(days / 7)} weeks`;
}

// ---- The plan, week by week ----

export type WeekItem =
  | {
      kind: "planned";
      session: PlanSession;
      status: Outcome | "no-log" | "open";
    }
  | { kind: "unplanned"; log: Log };

export type Week = {
  start: string;
  items: WeekItem[];
  planned: number;
  logged: number;
  plannedMinutes: number;
  loggedMinutes: number;
  logsWithoutMinutes: number;
  minutesBySport: Record<string, number>;
  signals: Log[];
};

export function week(start: string): Week {
  const end = addDays(start, 6);
  const inWeek = (date: string) => date >= start && date <= end;
  const items: WeekItem[] = [];
  for (const session of sessions.filter((s) => inWeek(s.date))) {
    items.push({
      kind: "planned",
      session,
      status: session.outcome ?? (session.date < TODAY ? "no-log" : "open"),
    });
  }
  const weekLogs = logs.filter((log) => inWeek(log.date));
  for (const log of weekLogs.filter((l) => !l.planned)) {
    items.push({ kind: "unplanned", log });
  }
  items.sort((a, b) => itemDate(a).localeCompare(itemDate(b)));

  const trained = weekLogs.filter((log) => log.outcome !== "skipped");
  const minutesBySport: Record<string, number> = {};
  for (const log of trained) {
    if (log.minutes === null) continue;
    minutesBySport[log.sport] = (minutesBySport[log.sport] ?? 0) + log.minutes;
  }
  const plannedSessions = items.filter((item) => item.kind === "planned");
  return {
    start,
    items,
    // Sessions whose day has passed; today's is still open.
    planned: plannedSessions.filter((item) => item.session.date < TODAY).length,
    // Done, fully or partly. A skip is a log, but it is not training.
    logged: plannedSessions.filter(
      (item) =>
        item.status === "completed" || item.status === "partially_completed",
    ).length,
    plannedMinutes: plannedSessions.reduce(
      (sum, item) => sum + (item.session.minutes ?? 0),
      0,
    ),
    loggedMinutes: trained.reduce((sum, log) => sum + (log.minutes ?? 0), 0),
    logsWithoutMinutes: trained.filter((log) => log.minutes === null).length,
    minutesBySport,
    signals: weekLogs.filter(
      (log) => log.pain || log.illness || log.injury || log.fatigue,
    ),
  };
}

export function itemDate(item: WeekItem) {
  return item.kind === "planned" ? item.session.date : item.log.date;
}

export function itemTitle(item: WeekItem) {
  return item.kind === "planned" ? item.session.title : item.log.title;
}

export function itemStatus(item: WeekItem): Outcome | "no-log" | "open" {
  return item.kind === "planned" ? item.status : "unplanned";
}

/** The last `count` weeks, the current one last. */
export function recentWeeks(count: number) {
  const current = mondayOf(TODAY);
  return Array.from({ length: count }, (_, index) =>
    week(addDays(current, (index - count + 1) * 7)),
  );
}

export const STATUS_LABELS: Record<Outcome | "no-log" | "open", string> = {
  completed: "Completed",
  partially_completed: "Partly",
  skipped: "Skipped",
  replaced: "Replaced",
  unplanned: "Unplanned",
  "no-log": "No log",
  open: "Coming up",
};

// ---- Activities and what they measured ----

export type Metric = "load" | "reps" | "distance" | "pace" | "minutes";

export type Point = { date: string; value: number; label: string };

export type Series = {
  name: string;
  metric: Metric;
  points: Point[];
  best: Point;
  first: Point;
  last: Point;
  /** "Heaviest top set", "Fastest pace" — what `best` is the best of. */
  bestLabel: string;
  unit: string;
  lowerIsBetter: boolean;
};

function groupsOf(m: Measurement): Group[] {
  if (m.groups) return m.groups;
  if (m.sets !== undefined) {
    return [{ sets: m.sets, reps: m.reps, load: m.load }];
  }
  return [];
}

export function pace(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function kg(value: number) {
  return `${value.toLocaleString("en-GB")} kg`;
}

function pointFor(log: ActivityLog, metric: Metric): Point | null {
  const m = log.measurement;
  switch (metric) {
    case "load": {
      const top = groupsOf(m)
        .filter((group) => group.load !== undefined)
        .sort((a, b) => (b.load ?? 0) - (a.load ?? 0))[0];
      if (!top?.load) return null;
      return {
        date: log.date,
        value: top.load,
        label: `${kg(top.load)} × ${top.reps ?? "?"}`,
      };
    }
    case "reps": {
      const top = groupsOf(m)
        .filter((group) => group.reps !== undefined)
        .sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0))[0];
      if (!top?.reps) return null;
      return {
        date: log.date,
        value: top.reps,
        label: top.sets > 1 ? `${top.sets} × ${top.reps}` : `${top.reps}`,
      };
    }
    case "distance":
      return m.distance === undefined
        ? null
        : {
            date: log.date,
            value: m.distance,
            label: `${m.distance.toLocaleString("en-GB")} ${m.distance_unit ?? "km"}`,
          };
    case "pace":
      return m.pace_seconds_per_unit === undefined
        ? null
        : {
            date: log.date,
            value: m.pace_seconds_per_unit,
            label: `${pace(m.pace_seconds_per_unit)} /km`,
          };
    case "minutes": {
      const minutes =
        m.duration_minutes ??
        (m.duration_seconds === undefined
          ? undefined
          : Math.round(m.duration_seconds / 60));
      return minutes === undefined
        ? null
        : { date: log.date, value: minutes, label: `${minutes} min` };
    }
  }
}

function defaultMetric(name: string): Metric {
  const sample = activities.filter((a) => a.name === name);
  const mode = sample[0]?.mode;
  if (mode === "sets_reps_load") {
    return sample.some((a) => groupsOf(a.measurement).some((g) => g.load))
      ? "load"
      : "reps";
  }
  if (mode === "time_distance_pace") {
    const distances = new Set(
      sample.map((a) => a.measurement.distance).filter(Boolean),
    );
    if (distances.size > 1) return "distance";
    if (sample.some((a) => a.measurement.pace_seconds_per_unit)) return "pace";
    return "minutes";
  }
  return "minutes";
}

const BEST_LABEL: Record<Metric, string> = {
  load: "Heaviest top set",
  reps: "Most reps in a set",
  distance: "Longest",
  pace: "Fastest pace",
  minutes: "Longest",
};

const UNIT: Record<Metric, string> = {
  load: "kg",
  reps: "reps",
  distance: "km",
  pace: "/km",
  minutes: "min",
};

export function series(
  name: string,
  metric = defaultMetric(name),
): Series | null {
  const points = activities
    .filter((a) => a.name === name)
    .map((a) => pointFor(a, metric))
    .filter((point): point is Point => point !== null);
  if (points.length === 0) return null;
  const lowerIsBetter = metric === "pace";
  const best = points.reduce((winner, point) =>
    lowerIsBetter
      ? point.value < winner.value
        ? point
        : winner
      : point.value > winner.value
        ? point
        : winner,
  );
  return {
    name,
    metric,
    points,
    best,
    first: points[0],
    last: points[points.length - 1],
    bestLabel: BEST_LABEL[metric],
    unit: UNIT[metric],
    lowerIsBetter,
  };
}

/** Activities by how often they were logged, warm-ups and cool-downs aside. */
export const topActivities = (() => {
  const counts = new Map<string, number>();
  for (const a of activities) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([name]) => !["Einlaufen", "Auslaufen"].includes(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
})();

/**
 * One line per activity whose best moved in a date range: the best it reached
 * there, against the best it had before the range began.
 */
export function bestsBetween(start: string, end: string) {
  const found: { name: string; point: Point; previous: Point }[] = [];
  for (const { name } of topActivities) {
    const s = series(name);
    if (!s) continue;
    const beats = (a: Point, b: Point) =>
      s.lowerIsBetter ? a.value < b.value : a.value > b.value;
    let before: Point | null = null;
    let inRange: Point | null = null;
    for (const point of s.points) {
      if (point.date < start) {
        if (before === null || beats(point, before)) before = point;
      } else if (point.date <= end) {
        if (inRange === null || beats(point, inRange)) inRange = point;
      }
    }
    if (before && inRange && beats(inRange, before)) {
      found.push({ name, point: inRange, previous: before });
    }
  }
  return found;
}

export function activitiesOn(date: string) {
  return activities.filter((a) => a.date === date);
}

export function describeMeasurement(a: ActivityLog) {
  const p = pointFor(a, defaultMetric(a.name));
  if (!p) return null;
  const m = a.measurement;
  if (
    a.mode === "time_distance_pace" &&
    m.pace_seconds_per_unit &&
    m.distance
  ) {
    return `${m.distance} km · ${pace(m.pace_seconds_per_unit)} /km`;
  }
  if (a.mode === "sets_reps_load") {
    return groupsOf(m)
      .map((g) =>
        g.load
          ? `${g.sets} × ${g.reps ?? "?"} @ ${kg(g.load)}`
          : `${g.sets} × ${g.reps ?? g.seconds}`,
      )
      .join(", ");
  }
  return p.label;
}

// ---- Signals ----

export function signalWords(log: Log) {
  return [
    log.pain ? "pain" : null,
    log.illness ? "illness" : null,
    log.injury ? "injury" : null,
    log.fatigue ? "severe fatigue" : null,
  ].filter((word): word is string => word !== null);
}

export function signalsSince(date: string) {
  return logs.filter(
    (log) =>
      log.date >= date &&
      (log.pain || log.illness || log.injury || log.fatigue),
  );
}

// ---- The roadmap ----

export function currentPhaseIndex() {
  return roadmap.phases.findIndex(
    (phase) => phase.startDate <= TODAY && phase.endDate >= TODAY,
  );
}

export function phaseWeek(phase: Phase) {
  const total = Math.ceil(
    (daysBetween(phase.startDate, phase.endDate) + 1) / 7,
  );
  const current = Math.floor(daysBetween(phase.startDate, TODAY) / 7) + 1;
  return { current, total };
}

export function milestoneMark(phaseIndex: number, milestoneIndex: number) {
  return (
    marks.find(
      (mark) => mark.phase === phaseIndex && mark.milestone === milestoneIndex,
    ) ?? null
  );
}

export function allMilestones() {
  return roadmap.phases.flatMap((phase, phaseIndex) =>
    phase.milestones.map((milestone, milestoneIndex) => ({
      ...milestone,
      phaseIndex,
      phaseTitle: phase.title,
      mark: milestoneMark(phaseIndex, milestoneIndex),
    })),
  );
}

export function milestonesFor(goalId: string) {
  return allMilestones().filter((m) => m.goalIds.includes(goalId));
}

export function attentionFor(goalId: string, phase: Phase | undefined) {
  return phase?.attention.find((a) => a.goalId === goalId)?.level ?? null;
}

// ---- Goal links: NOT in the product ----

/**
 * What a goal would need to show a number against its target: which activity
 * measures it, by what, and the target. Goals are free text today, so this is
 * hand-set for the prototype.
 */
export type GoalLink = {
  activity: string;
  metric: Metric;
  target: number;
  targetLabel: string;
};

export const GOAL_LINKS: Record<string, GoalLink> = {
  // 8 saubere Klimmzüge
  "38165d04-9692-437f-a042-c4a518890bd1": {
    activity: "Klimmzüge",
    metric: "reps",
    target: 8,
    targetLabel: "8 in a row",
  },
  // Kreuzheben 1,5× Körpergewicht
  "b1b90723-5bcf-4ea8-be86-5519f7dc7c97": {
    activity: "Kreuzheben",
    metric: "load",
    target: 100,
    targetLabel: "about 100 kg",
  },
  // Halbmarathon unter 1:50
  "00072c32-fb86-4bf4-9f18-896bc3a05c13": {
    activity: "Dauerlauf locker",
    metric: "distance",
    target: 21.1,
    targetLabel: "21.1 km",
  },
};

export function goalSeries(goal: Goal) {
  const link = GOAL_LINKS[goal.id];
  if (!link) return null;
  const s = series(link.activity, link.metric);
  return s ? { link, series: s } : null;
}

export function logsForSports(sports: string[]) {
  return logs.filter((log) => sports.includes(log.sport));
}

export const SPORT_COLOURS: Record<string, string> = {
  Laufen: "var(--pine-soft)",
  Krafttraining: "var(--ember)",
  Klettern: "#b7892d",
  Mobility: "var(--recovery)",
  Radfahren: "#5a6fa0",
};

export const sportsInRecord = [...new Set(logs.map((log) => log.sport))];
