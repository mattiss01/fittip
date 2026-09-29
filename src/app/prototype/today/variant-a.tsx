"use client";

/**
 * PROTOTYPE — Variant A, "Night session". Bold and dark. One session fills the
 * screen, the screen takes on the colour of its training zone, and the workout
 * is drawn as its own shape. Hold the button to log it done in one gesture.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";

import { GOAL, type ProtoSession } from "./fixture";
import { CheckIcon, ChevronIcon, FlameIcon, MoonIcon, NAV } from "./icons";
import {
  formatMinutes,
  LogForm,
  Sheet,
  useProtoWeek,
  useSwipe,
  type LogFormClasses,
} from "./shared";
import s from "./variant-a.module.css";

export const name = "Night session";

const ZONE_COLOURS = [
  "",
  "#5CC8FF",
  "#3EE0A1",
  "#FFD35C",
  "#FF8B3D",
  "#FF4D7A",
];
const ZONE_WORDS = ["", "Recovery", "Easy", "Steady", "Tempo", "Max"];

export function VariantA() {
  const week = useProtoWeek();
  const { day, logs } = week;
  const swipe = useSwipe(
    () => week.go(1),
    () => week.go(-1),
  );
  const [sheetFor, setSheetFor] = useState<ProtoSession | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  const next = day.sessions.find((session) => !logs[session.id]);
  // A session just logged stays on stage for its moment, then the next slides in.
  const hero =
    day.sessions.find((session) => session.id === celebrate) ??
    next ??
    day.sessions[0];
  const zone = day.isRecovery || !hero ? 1 : hero.zone;
  const others = day.sessions.filter((session) => session !== hero);

  const complete = (session: ProtoSession) => {
    week.log(session.id, { outcome: "done", effort: 7, signals: [] });
    setCelebrate(session.id);
  };

  useEffect(() => {
    if (!celebrate) return;
    const timer = window.setTimeout(() => {
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      document.documentElement.dataset.protoDir = "next";
      if (doc.startViewTransition) {
        doc.startViewTransition(() => flushSync(() => setCelebrate(null)));
      } else {
        setCelebrate(null);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  return (
    <div
      className={s.root}
      style={{ "--zone": ZONE_COLOURS[zone] } as CSSProperties}
    >
      <div className={s.glow} aria-hidden="true" />

      <header className={s.top}>
        <div className={s.dayNav}>
          <button
            type="button"
            className={s.iconButton}
            onClick={() => week.go(-1)}
            aria-label="Previous day"
            disabled={week.dayIndex === 0}
          >
            <ChevronIcon direction="left" />
          </button>
          <div className={s.dateBlock}>
            <span className={s.dateSmall}>
              {week.isToday ? "Today" : day.weekday}
            </span>
            <span className={s.dateBig}>
              {day.short} {day.dayOfMonth}
            </span>
          </div>
          <button
            type="button"
            className={s.iconButton}
            onClick={() => week.go(1)}
            aria-label="Next day"
            disabled={week.dayIndex === 6}
          >
            <ChevronIcon />
          </button>
        </div>
        <div
          className={s.streak}
          aria-label={`${week.streak} days kept in a row`}
        >
          <FlameIcon />
          <span key={week.streak} className={s.streakNumber}>
            {week.streak}
          </span>
        </div>
      </header>

      <div className={s.weekDots} aria-hidden="true">
        {week.dayStates.map((state, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            className={s.weekDot}
            data-state={state}
            data-current={index === week.dayIndex}
            onClick={() => week.jumpTo(index)}
          />
        ))}
      </div>

      <section className={s.stage} {...swipe}>
        {day.isRecovery || !hero ? (
          <div className={s.rest}>
            <MoonIcon size={40} className={s.restIcon} />
            <h1 className={s.heroTitle}>Rest day</h1>
            <p className={s.why}>Rest counts. Your streak keeps going.</p>
          </div>
        ) : (
          <HeroSession
            key={hero.id}
            session={hero}
            done={Boolean(logs[hero.id])}
            celebrating={celebrate === hero.id}
            canLog={week.dayIndex <= week.todayIndex}
            onHoldComplete={() => complete(hero)}
            onOpenDetails={() => setSheetFor(hero)}
            onUndo={() => week.unlog(hero.id)}
          />
        )}
      </section>

      {others.length > 0 && (
        <section className={s.later}>
          <h2 className={s.laterLabel}>Also today</h2>
          {others.map((session) => (
            <button
              key={session.id}
              type="button"
              className={s.laterRow}
              data-done={Boolean(logs[session.id])}
              onClick={() => setSheetFor(session)}
            >
              <span
                className={s.laterZone}
                style={{ background: ZONE_COLOURS[session.zone] }}
              />
              <span className={s.laterTitle}>{session.title}</span>
              <span className={s.laterMeta}>
                {logs[session.id] ? (
                  <CheckIcon size={18} />
                ) : (
                  formatMinutes(session.minutes)
                )}
              </span>
            </button>
          ))}
        </section>
      )}

      <p className={s.goal}>
        {GOAL.weeksLeft} weeks to <strong>{GOAL.title}</strong>
      </p>

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
              if (entry.outcome === "done") setCelebrate(sheetFor.id);
              setSheetFor(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function HeroSession({
  session,
  done,
  celebrating,
  canLog,
  onHoldComplete,
  onOpenDetails,
  onUndo,
}: {
  session: ProtoSession;
  done: boolean;
  celebrating: boolean;
  canLog: boolean;
  onHoldComplete: () => void;
  onOpenDetails: () => void;
  onUndo: () => void;
}) {
  const total = session.profile.reduce((sum, [minutes]) => sum + minutes, 0);
  const [holding, setHolding] = useState(false);
  const held = useRef(false);

  return (
    <div className={s.hero} data-done={done}>
      <p className={s.zoneTag}>
        Zone {session.zone} · {ZONE_WORDS[session.zone]}
      </p>
      <h1 className={s.heroTitle}>{session.title}</h1>
      <p className={s.heroNumbers}>
        <span className={s.bigNumber}>{session.minutes}</span>
        <span className={s.unit}>min</span>
        <span className={s.heroSport}>{session.sport}</span>
      </p>

      <div
        className={s.profile}
        role="img"
        aria-label={`Workout shape: ${session.activities.map((a) => `${a.name} ${a.target}`).join(", ")}`}
      >
        {session.profile.map(([minutes, zone], index) => (
          <span
            key={index}
            className={s.profileBlock}
            style={
              {
                flexGrow: minutes / total,
                height: `${20 + zone * 16}%`,
                background: ZONE_COLOURS[zone],
                animationDelay: `${index * 50}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <ul className={s.steps}>
        {session.activities.map((activity) => (
          <li key={activity.name}>
            <span>{activity.name}</span>
            <span className={s.stepTarget}>{activity.target}</span>
          </li>
        ))}
      </ul>

      <p className={s.why}>{session.why}</p>

      {done ? (
        <div className={s.doneBar} data-celebrating={celebrating}>
          <span className={s.doneCheck}>
            <CheckIcon size={26} />
          </span>
          <span className={s.doneText}>Logged</span>
          <button type="button" className={s.textButton} onClick={onUndo}>
            Undo
          </button>
          <button
            type="button"
            className={s.textButton}
            onClick={onOpenDetails}
          >
            Edit
          </button>
        </div>
      ) : canLog ? (
        <>
          <button
            type="button"
            className={s.hold}
            data-holding={holding}
            onPointerDown={() => {
              held.current = false;
              setHolding(true);
            }}
            onPointerUp={() => setHolding(false)}
            onPointerLeave={() => setHolding(false)}
            onPointerCancel={() => setHolding(false)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (!held.current) onOpenDetails();
            }}
          >
            <span
              className={s.holdFill}
              onAnimationEnd={() => {
                held.current = true;
                setHolding(false);
                onHoldComplete();
              }}
            />
            <span className={s.holdLabel}>Hold to log done</span>
          </button>
          <button type="button" className={s.secondary} onClick={onOpenDetails}>
            Log it differently
          </button>
        </>
      ) : (
        <p className={s.upcoming}>Coming up. Log it on the day.</p>
      )}
    </div>
  );
}
