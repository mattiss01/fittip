"use client";

/**
 * PROTOTYPE — Variant B, "Week ring". Clean and light. The week is a ring of
 * seven days (rest days count as kept), and the day is a short checklist:
 * tap the circle to log a session done, tap the row to see its steps.
 */

import { useEffect, useState } from "react";

import { GOAL, WEEK, type ProtoSession } from "./fixture";
import { CheckIcon, ChevronIcon, MoonIcon, NAV } from "./icons";
import {
  formatMinutes,
  LogForm,
  Sheet,
  useProtoWeek,
  useSwipe,
  type LogFormClasses,
} from "./shared";
import s from "./variant-b.module.css";

export const name = "Week ring";

const OUTCOME_WORDS = {
  done: "Done",
  partly: "Some of it",
  skipped: "Skipped",
};

export function VariantB() {
  const week = useProtoWeek();
  const { day, logs } = week;
  const swipe = useSwipe(
    () => week.go(1),
    () => week.go(-1),
  );
  const [sheetFor, setSheetFor] = useState<ProtoSession | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; title: string } | null>(
    null,
  );

  const kept = week.dayStates.filter(
    (state) => state === "kept" || state === "rest-kept",
  ).length;
  const future = week.dayIndex > week.todayIndex;
  const dayMinutes = day.sessions.reduce((sum, x) => sum + x.minutes, 0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const quickDone = (session: ProtoSession) => {
    if (logs[session.id]) {
      week.unlog(session.id);
      return;
    }
    week.log(session.id, { outcome: "done", effort: 6, signals: [] });
    setToast({ id: session.id, title: session.title });
  };

  return (
    <div className={s.root}>
      <header className={s.header}>
        <p className={s.hello}>Good morning</p>
        <p className={s.date}>
          {day.weekday}, {day.dayOfMonth}{" "}
          {day.dayOfMonth > 20 ? "September" : "October"}
        </p>
      </header>

      <section className={s.ringWrap} aria-label="This week">
        <WeekRing
          states={week.dayStates}
          current={week.dayIndex}
          onPick={week.jumpTo}
        />
        <div className={s.ringCentre}>
          <span key={kept} className={s.ringNumber}>
            {kept}
          </span>
          <span className={s.ringOf}>of 7 days on plan</span>
        </div>
      </section>

      <div className={s.dayPicker} role="tablist" aria-label="Day">
        {WEEK.map((d, index) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={index === week.dayIndex}
            className={s.dayChip}
            data-today={index === week.todayIndex}
            onClick={() => week.jumpTo(index)}
          >
            <span>{d.short.slice(0, 1)}</span>
          </button>
        ))}
      </div>

      <section className={s.day} {...swipe}>
        <div className={s.dayHead}>
          <h1 className={s.dayTitle}>{week.isToday ? "Today" : day.weekday}</h1>
          {!day.isRecovery && (
            <span className={s.dayTotal}>{formatMinutes(dayMinutes)}</span>
          )}
        </div>

        {day.isRecovery ? (
          <div className={s.restCard}>
            <MoonIcon size={28} />
            <div>
              <p className={s.restTitle}>Rest day</p>
              <p className={s.restText}>It counts toward your week.</p>
            </div>
          </div>
        ) : (
          <ol className={s.timeline}>
            {day.sessions.map((session) => {
              const entry = logs[session.id];
              const expanded = openRow === session.id;
              return (
                <li
                  key={session.id}
                  className={s.item}
                  data-done={Boolean(entry)}
                >
                  <button
                    type="button"
                    className={s.check}
                    data-done={Boolean(entry)}
                    disabled={future}
                    aria-label={
                      entry
                        ? `Undo log for ${session.title}`
                        : `Log ${session.title} done`
                    }
                    onClick={() => quickDone(session)}
                  >
                    <CheckIcon size={20} />
                  </button>
                  <div className={s.itemBody}>
                    <button
                      type="button"
                      className={s.itemHead}
                      aria-expanded={expanded}
                      onClick={() => setOpenRow(expanded ? null : session.id)}
                    >
                      <span className={s.itemTitle}>{session.title}</span>
                      <span className={s.itemMeta}>
                        {entry
                          ? OUTCOME_WORDS[entry.outcome]
                          : formatMinutes(session.minutes)}
                      </span>
                      <ChevronIcon
                        size={18}
                        direction="down"
                        className={s.chevron}
                      />
                    </button>
                    <p className={s.itemWhy}>{session.why}</p>
                    <div className={s.reveal} data-open={expanded}>
                      <div>
                        <ul className={s.steps}>
                          {session.activities.map((activity) => (
                            <li key={activity.name}>
                              <span>{activity.name}</span>
                              <span>{activity.target}</span>
                            </li>
                          ))}
                        </ul>
                        {!future && (
                          <button
                            type="button"
                            className={s.detailButton}
                            onClick={() => setSheetFor(session)}
                          >
                            {entry ? "Edit log" : "Log with details"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={s.goal}>
        <div className={s.goalText}>
          <span className={s.goalLabel}>Goal</span>
          <span className={s.goalTitle}>{GOAL.title}</span>
        </div>
        <span className={s.goalWhen}>
          {GOAL.weeksLeft} weeks
          <small>{GOAL.date}</small>
        </span>
      </section>

      <div className={s.toast} data-open={toast !== null} role="status">
        {toast && (
          <>
            <span>
              <CheckIcon size={16} /> {toast.title} logged
            </span>
            <button
              type="button"
              onClick={() => {
                week.unlog(toast.id);
                setToast(null);
              }}
            >
              Undo
            </button>
          </>
        )}
      </div>

      <nav className={s.nav} aria-label="Primary">
        {NAV.map(({ label, Icon }) => (
          <a
            key={label}
            href="#"
            className={s.navItem}
            aria-current={label === "Today" ? "page" : undefined}
            onClick={(event) => event.preventDefault()}
          >
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <Sheet
        open={sheetFor !== null}
        onClose={() => setSheetFor(null)}
        label="Log session"
        classes={{ backdrop: s.backdrop, sheet: s.sheet, grip: s.grip }}
      >
        {sheetFor && (
          <LogForm
            key={sheetFor.id}
            session={sheetFor}
            existing={logs[sheetFor.id]}
            classes={s as unknown as LogFormClasses}
            onSave={(entry) => {
              week.log(sheetFor.id, entry);
              setSheetFor(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

const RADIUS = 92;
const GAP_DEGREES = 6;

function arc(index: number) {
  const span = 360 / 7;
  const start = ((index * span + GAP_DEGREES / 2 - 90) * Math.PI) / 180;
  const end = (((index + 1) * span - GAP_DEGREES / 2 - 90) * Math.PI) / 180;
  const x1 = 110 + RADIUS * Math.cos(start);
  const y1 = 110 + RADIUS * Math.sin(start);
  const x2 = 110 + RADIUS * Math.cos(end);
  const y2 = 110 + RADIUS * Math.sin(end);
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2}`;
}

function WeekRing({
  states,
  current,
  onPick,
}: {
  states: string[];
  current: number;
  onPick: (index: number) => void;
}) {
  return (
    <svg viewBox="0 0 220 220" className={s.ring} aria-hidden="true">
      {states.map((state, index) => (
        <g key={index} onClick={() => onPick(index)} className={s.segment}>
          <path d={arc(index)} className={s.track} />
          <path
            d={arc(index)}
            className={s.fill}
            data-state={state}
            pathLength={1}
          />
          {index === current && (
            <path d={arc(index)} className={s.currentMark} />
          )}
        </g>
      ))}
    </svg>
  );
}
