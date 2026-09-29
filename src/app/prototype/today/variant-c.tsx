"use client";

/**
 * PROTOTYPE — Variant C, "Coach's note". FitTip's own pine and ember, made
 * modern. A swipeable strip of days on top, the coach's one-line reason for
 * the day, and each session as a card that folds into a receipt once logged.
 */

import { useEffect, useRef, useState } from "react";

import { GOAL, WEEK, type ProtoSession } from "./fixture";
import { CheckIcon, MoonIcon, NAV } from "./icons";
import {
  formatMinutes,
  LogForm,
  Sheet,
  useProtoWeek,
  useSwipe,
  type LogFormClasses,
} from "./shared";
import s from "./variant-c.module.css";

export const name = "Coach's note";

const OUTCOME_WORDS = {
  done: "Done",
  partly: "Some of it",
  skipped: "Skipped",
};

export function VariantC() {
  const week = useProtoWeek();
  const { day, logs } = week;
  const swipe = useSwipe(
    () => week.go(1),
    () => week.go(-1),
  );
  const [sheetFor, setSheetFor] = useState<ProtoSession | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = strip.current?.querySelector<HTMLElement>(
      "[aria-selected='true']",
    );
    selected?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [week.dayIndex]);

  const future = week.dayIndex > week.todayIndex;
  const progress = Math.round((week.doneMinutes / week.plannedMinutes) * 100);
  const lead = day.sessions.find((session) => !logs[session.id]);

  const coachLine = day.isRecovery
    ? "Rest today. Your legs rebuild on days like this."
    : lead
      ? `${lead.title} ${week.isToday ? "today" : "on " + day.weekday}. ${lead.why}`
      : "All logged. Nice work — that's the day done.";

  return (
    <div className={s.root}>
      <header className={s.header}>
        <span className={s.brand}>FitTip</span>
        <span className={s.month}>Sep – Oct</span>
      </header>

      <div className={s.strip} ref={strip} role="tablist" aria-label="Day">
        {WEEK.map((d, index) => {
          const state = week.dayStates[index];
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={index === week.dayIndex}
              className={s.dayCard}
              data-state={state}
              data-today={index === week.todayIndex}
              onClick={() => week.jumpTo(index)}
            >
              <span className={s.dayName}>{d.short}</span>
              <span className={s.dayNumber}>{d.dayOfMonth}</span>
              <span className={s.dayMark} aria-hidden="true">
                {state === "kept" || state === "rest-kept" ? (
                  <CheckIcon size={14} />
                ) : d.isRecovery ? (
                  <MoonIcon size={14} />
                ) : (
                  <span className={s.dayDot} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <section className={s.goal} aria-label="Goal">
        <div className={s.goalRow}>
          <span>
            <strong>{GOAL.weeksLeft} weeks</strong> to {GOAL.title}
          </span>
          <span className={s.goalPct}>{progress}%</span>
        </div>
        <div className={s.bar}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className={s.barLabel}>
          This week · {formatMinutes(week.doneMinutes)} of{" "}
          {formatMinutes(week.plannedMinutes)}
        </span>
      </section>

      <div className={s.content} {...swipe}>
        <figure className={s.coach}>
          <span className={s.coachAvatar} aria-hidden="true">
            C
          </span>
          <blockquote key={coachLine} className={s.coachLine}>
            {coachLine}
          </blockquote>
        </figure>

        <h1 className={s.visuallyHidden}>
          {week.isToday ? "Today" : day.weekday}
        </h1>

        <div className={s.cards}>
          {day.sessions.map((session) => {
            const entry = logs[session.id];
            if (entry) {
              return (
                <button
                  key={session.id}
                  type="button"
                  className={s.receipt}
                  onClick={() => setSheetFor(session)}
                >
                  <span className={s.receiptCheck}>
                    <CheckIcon size={18} />
                  </span>
                  <span className={s.receiptTitle}>{session.title}</span>
                  <span className={s.receiptMeta}>
                    {OUTCOME_WORDS[entry.outcome]}
                    {entry.outcome !== "skipped" && ` · effort ${entry.effort}`}
                  </span>
                </button>
              );
            }
            return (
              <article key={session.id} className={s.card}>
                <p className={s.cardKicker}>
                  {session.sport} · {formatMinutes(session.minutes)}
                </p>
                <h2 className={s.cardTitle}>{session.title}</h2>
                <ol className={s.steps}>
                  {session.activities.map((activity) => (
                    <li key={activity.name}>
                      <span>{activity.name}</span>
                      <span>{activity.target}</span>
                    </li>
                  ))}
                </ol>
                {future ? (
                  <p className={s.later}>Log it on {day.weekday}.</p>
                ) : (
                  <button
                    type="button"
                    className={s.logButton}
                    onClick={() => setSheetFor(session)}
                  >
                    Log it
                    <span aria-hidden="true">→</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
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
            <Icon size={21} />
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
