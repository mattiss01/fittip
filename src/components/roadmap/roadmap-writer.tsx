"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";

import { RoadmapComposeSessionContext } from "./roadmap-compose-session";
import { formatRoadmapDate } from "./roadmap-dates";
import { RoadmapWatchNotice } from "./roadmap-watch-notice";
import {
  isRefusal,
  useRoadmapRecovered,
  useRoadmapWrite,
} from "./use-roadmap-write";

import { writeRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  COACH_START_MAX_DAYS_AHEAD,
  shiftIsoDate,
} from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * A roadmap written by hand (ADR-029), in force on save.
 *
 * The form always starts empty (owner, 13 Oct 2026): a title, the dates, and
 * one phase with nothing in it. What counts as a roadmap is a title, the
 * dates, and one phase with a title, what it is for and one goal; a summary
 * and milestones are optional, and a milestone's details are too.
 *
 * A phase's start is shown, never typed. The first starts with the roadmap,
 * each next one the day after the one before it ends, and the last ends with
 * the roadmap, so a gap or an overlap cannot be entered at all. What the form
 * cannot stop, a goal left out or a date outside its phase, the server's
 * validator refuses in words of its own, as it refuses the coach's.
 *
 * Every block is keyed by an id minted when it is added, so typing a date
 * never rebuilds the block it is in.
 *
 * The draft travels as one JSON field, the encoding an edit uses too, so the
 * server never reassembles a nested shape from flattened field names.
 */

const LEVELS = ["primary", "secondary", "maintenance", "deferred"] as const;
type Level = (typeof LEVELS)[number];

/** The version a roadmap is written as; the server refuses any other. */
const ROADMAP_SCHEMA_VERSION = "fittip.roadmap.v4";

const MAX_PHASES = 6;
const MAX_GOALS_PER_PHASE = 4;
const MAX_MILESTONES_PER_PHASE = 3;
const MIN_DAYS = 28;
const MAX_DAYS = 365;

const LABELS = ROADMAP_CONTROL_COPY.writeFieldLabels;

type Attention = { key: string; goalId: string; level: Level };
type Milestone = {
  key: string;
  title: string;
  targetDate: string;
  goalIds: string[];
  details: string;
};
type Phase = {
  key: string;
  title: string;
  focus: string;
  /** Unused on the last phase, which ends with the roadmap. */
  endDate: string;
  goalAttention: Attention[];
  milestones: Milestone[];
};
type Draft = {
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  phases: Phase[];
};

export type RoadmapWriterGoal = { id: string; title: string };

export function RoadmapWriter({
  today,
  goals,
  expectedHeadRevision,
  replaces,
  headingId,
}: {
  today: string;
  /** The owner's active goals, the only ones a phase may be for. */
  goals: RoadmapWriterGoal[];
  /** The head the page read: a roadmap accepted since refuses the save. */
  expectedHeadRevision: number;
  /** Whether a roadmap is in force, which this one would replace. */
  replaces: boolean;
  headingId?: string;
}) {
  const { state, submit, pending, lostRender } =
    useRoadmapWrite(writeRoadmapAction);
  const recovered = useRoadmapRecovered(state.submission === 0);
  const fieldId = useId();

  // In the sheet: held open while the save is under way, and closed once it
  // has landed, because the sheet outlives a write that leaves a roadmap in
  // force before and after.
  const session = useContext(RoadmapComposeSessionContext);
  const reportPending = session?.setPending;
  const close = session?.close;
  useEffect(() => {
    reportPending?.(pending);
    return () => reportPending?.(false);
  }, [reportPending, pending]);
  useEffect(() => {
    if (state.status === "written") close?.();
  }, [close, state.status]);

  const nextKey = useRef(0);
  const mint = () => `k${(nextKey.current += 1)}`;

  const [draft, setDraft] = useState<Draft>(() => ({
    title: "",
    summary: "",
    startDate: today,
    endDate: "",
    phases: [emptyPhase("k0")],
  }));

  const update = (mutate: (next: Draft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  if (goals.length === 0) {
    return (
      <section className={styles.card} data-roadmap-write>
        <h2 className={styles.cardHeading} id={headingId}>
          {ROADMAP_CONTROL_COPY.writeTitle}
        </h2>
        <p className={styles.emptyState}>{ROADMAP_CONTROL_COPY.writeNoGoals}</p>
      </section>
    );
  }

  const goalTitles = new Map(goals.map((goal) => [goal.id, goal.title]));
  const starts = phaseStarts(draft);
  const latestStart = shiftIsoDate(today, COACH_START_MAX_DAYS_AHEAD);

  return (
    <section className={styles.card} data-roadmap-write>
      <h2 className={styles.cardHeading} id={headingId}>
        {ROADMAP_CONTROL_COPY.writeTitle}
      </h2>

      <RoadmapWatchNotice lostRender={lostRender} recovered={recovered} />

      {isRefusal(state) ? (
        <p
          className={styles.notice}
          data-roadmap-notice={state.status}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <form action={submit} className={styles.form}>
        <input
          type="hidden"
          name="expectedHeadRevision"
          value={expectedHeadRevision}
        />
        <input
          type="hidden"
          name="content"
          value={JSON.stringify(toContent(draft, starts))}
        />

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-title`}>
            {LABELS.title}
          </label>
          <input
            className={styles.input}
            id={`${fieldId}-title`}
            value={draft.title}
            maxLength={80}
            required
            onChange={(event) =>
              update((next) => {
                next.title = event.target.value;
              })
            }
          />
        </div>

        <div className={styles.field}>
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-start`}>
                {ROADMAP_CONTROL_COPY.startDateLabel}
              </label>
              <input
                className={styles.input}
                id={`${fieldId}-start`}
                type="date"
                value={draft.startDate}
                min={today}
                max={latestStart}
                required
                onChange={(event) =>
                  update((next) => {
                    next.startDate = event.target.value;
                  })
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-end`}>
                {ROADMAP_CONTROL_COPY.endDateLabel}
              </label>
              <input
                className={styles.input}
                id={`${fieldId}-end`}
                type="date"
                value={draft.endDate}
                {...(isDate(draft.startDate)
                  ? {
                      min: shiftIsoDate(draft.startDate, MIN_DAYS),
                      max: shiftIsoDate(draft.startDate, MAX_DAYS),
                    }
                  : {})}
                required
                onChange={(event) =>
                  update((next) => {
                    next.endDate = event.target.value;
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-summary`}>
            {LABELS.summary}
          </label>
          <textarea
            className={styles.textarea}
            id={`${fieldId}-summary`}
            value={draft.summary}
            maxLength={600}
            rows={3}
            onChange={(event) =>
              update((next) => {
                next.summary = event.target.value;
              })
            }
          />
        </div>

        {draft.phases.map((phase, phaseIndex) => {
          const isLast = phaseIndex === draft.phases.length - 1;
          const start = starts[phaseIndex] ?? "";
          const end = isLast ? draft.endDate : phase.endDate;
          const unusedGoals = goals.filter(
            (goal) =>
              !phase.goalAttention.some((entry) => entry.goalId === goal.id),
          );
          const id = `${fieldId}-${phase.key}`;

          return (
            <fieldset
              className={styles.editGroup}
              key={phase.key}
              data-roadmap-write-phase={phaseIndex + 1}
            >
              <legend className={styles.editLegend}>
                {LABELS.phase(phaseIndex + 1)}
              </legend>
              {isDate(start) ? (
                <p className={styles.helper}>
                  {LABELS.phaseStarts(formatRoadmapDate(start))}
                </p>
              ) : null}

              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${id}-title`}>
                  {LABELS.phaseTitle}
                </label>
                <input
                  className={styles.input}
                  id={`${id}-title`}
                  value={phase.title}
                  maxLength={80}
                  required
                  onChange={(event) =>
                    update((next) => {
                      next.phases[phaseIndex]!.title = event.target.value;
                    })
                  }
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${id}-focus`}>
                  {LABELS.phaseFocus}
                </label>
                <textarea
                  className={styles.textarea}
                  id={`${id}-focus`}
                  value={phase.focus}
                  maxLength={300}
                  rows={2}
                  required
                  onChange={(event) =>
                    update((next) => {
                      next.phases[phaseIndex]!.focus = event.target.value;
                    })
                  }
                />
              </div>
              {isLast ? (
                isDate(draft.endDate) ? (
                  <p className={styles.helper}>
                    {LABELS.phaseEndsWithRoadmap(
                      formatRoadmapDate(draft.endDate),
                    )}
                  </p>
                ) : null
              ) : (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`${id}-end`}>
                    {LABELS.phaseEnd}
                  </label>
                  <input
                    className={styles.input}
                    id={`${id}-end`}
                    type="date"
                    value={phase.endDate}
                    {...(isDate(start) ? { min: start } : {})}
                    {...(isDate(draft.endDate) ? { max: draft.endDate } : {})}
                    required
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex]!.endDate = event.target.value;
                      })
                    }
                  />
                </div>
              )}

              {phase.goalAttention.map((attention, attentionIndex) => (
                <div className={styles.editRow} key={attention.key}>
                  <div className={styles.dateRow}>
                    <div className={styles.field}>
                      <label
                        className={styles.label}
                        htmlFor={`${id}-${attention.key}-goal`}
                      >
                        {LABELS.goal}
                      </label>
                      <select
                        className={styles.input}
                        id={`${id}-${attention.key}-goal`}
                        value={attention.goalId}
                        onChange={(event) =>
                          update((next) => {
                            const target = next.phases[phaseIndex]!;
                            const previous =
                              target.goalAttention[attentionIndex]!.goalId;
                            const chosen = event.target.value;
                            target.goalAttention[attentionIndex]!.goalId =
                              chosen;
                            // A milestone for the goal this row named is for
                            // the goal it names now: a milestone is for goals
                            // of its own phase.
                            for (const milestone of target.milestones) {
                              milestone.goalIds = milestone.goalIds.map(
                                (goalId) =>
                                  goalId === previous ? chosen : goalId,
                              );
                            }
                          })
                        }
                      >
                        {[
                          { id: attention.goalId, title: "" },
                          ...unusedGoals,
                        ].map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goalTitles.get(goal.id) ?? goal.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label
                        className={styles.label}
                        htmlFor={`${id}-${attention.key}-level`}
                      >
                        {LABELS.level}
                      </label>
                      <select
                        className={styles.input}
                        id={`${id}-${attention.key}-level`}
                        value={attention.level}
                        onChange={(event) =>
                          update((next) => {
                            next.phases[phaseIndex]!.goalAttention[
                              attentionIndex
                            ]!.level = event.target.value as Level;
                          })
                        }
                      >
                        {LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {ROADMAP_CONTROL_COPY.levelLabels[level]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    className={styles.quietAction}
                    type="button"
                    onClick={() =>
                      update((next) => {
                        const target = next.phases[phaseIndex]!;
                        target.goalAttention.splice(attentionIndex, 1);
                        // A milestone is for goals of its own phase.
                        for (const milestone of target.milestones) {
                          milestone.goalIds = milestone.goalIds.filter(
                            (goalId) => goalId !== attention.goalId,
                          );
                        }
                      })
                    }
                  >
                    {LABELS.removeGoal}
                  </button>
                </div>
              ))}
              {unusedGoals.length > 0 &&
              phase.goalAttention.length < MAX_GOALS_PER_PHASE ? (
                <button
                  className={styles.quietAction}
                  type="button"
                  onClick={() =>
                    update((next) => {
                      next.phases[phaseIndex]!.goalAttention.push({
                        key: mint(),
                        goalId: unusedGoals[0]!.id,
                        level: "primary",
                      });
                    })
                  }
                >
                  {LABELS.addGoal}
                </button>
              ) : null}

              {phase.milestones.map((milestone, milestoneIndex) => {
                const mid = `${id}-${milestone.key}`;
                return (
                  <fieldset className={styles.editRow} key={milestone.key}>
                    <legend className={styles.label}>
                      {LABELS.milestone(milestoneIndex + 1)}
                    </legend>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`${mid}-title`}>
                        {LABELS.milestoneTitle}
                      </label>
                      <input
                        className={styles.input}
                        id={`${mid}-title`}
                        value={milestone.title}
                        maxLength={80}
                        required
                        onChange={(event) =>
                          update((next) => {
                            next.phases[phaseIndex]!.milestones[
                              milestoneIndex
                            ]!.title = event.target.value;
                          })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`${mid}-date`}>
                        {LABELS.milestoneDate}
                      </label>
                      <input
                        className={styles.input}
                        id={`${mid}-date`}
                        type="date"
                        value={milestone.targetDate}
                        {...(isDate(start) ? { min: start } : {})}
                        {...(isDate(end) ? { max: end } : {})}
                        required
                        onChange={(event) =>
                          update((next) => {
                            next.phases[phaseIndex]!.milestones[
                              milestoneIndex
                            ]!.targetDate = event.target.value;
                          })
                        }
                      />
                    </div>
                    {phase.goalAttention.length === 0 ? null : (
                      <fieldset className={styles.field}>
                        <legend className={styles.label}>
                          {LABELS.milestoneGoals}
                        </legend>
                        {phase.goalAttention.map((attention) => (
                          <label key={attention.key}>
                            <input
                              type="checkbox"
                              checked={milestone.goalIds.includes(
                                attention.goalId,
                              )}
                              onChange={(event) =>
                                update((next) => {
                                  const target =
                                    next.phases[phaseIndex]!.milestones[
                                      milestoneIndex
                                    ]!;
                                  target.goalIds = event.target.checked
                                    ? [...target.goalIds, attention.goalId]
                                    : target.goalIds.filter(
                                        (goalId) => goalId !== attention.goalId,
                                      );
                                })
                              }
                            />{" "}
                            {goalTitles.get(attention.goalId) ?? ""}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className={styles.field}>
                      <label
                        className={styles.label}
                        htmlFor={`${mid}-details`}
                      >
                        {LABELS.milestoneDetails}
                      </label>
                      <input
                        className={styles.input}
                        id={`${mid}-details`}
                        value={milestone.details}
                        maxLength={200}
                        onChange={(event) =>
                          update((next) => {
                            next.phases[phaseIndex]!.milestones[
                              milestoneIndex
                            ]!.details = event.target.value;
                          })
                        }
                      />
                    </div>
                    <button
                      className={styles.quietAction}
                      type="button"
                      onClick={() =>
                        update((next) => {
                          next.phases[phaseIndex]!.milestones.splice(
                            milestoneIndex,
                            1,
                          );
                        })
                      }
                    >
                      {LABELS.removeMilestone}
                    </button>
                  </fieldset>
                );
              })}
              {phase.milestones.length < MAX_MILESTONES_PER_PHASE ? (
                <button
                  className={styles.quietAction}
                  type="button"
                  onClick={() =>
                    update((next) => {
                      const target = next.phases[phaseIndex]!;
                      target.milestones.push({
                        key: mint(),
                        title: "",
                        targetDate: "",
                        // A phase for one goal has a milestone for that goal.
                        goalIds:
                          target.goalAttention.length === 1
                            ? [target.goalAttention[0]!.goalId]
                            : [],
                        details: "",
                      });
                    })
                  }
                >
                  {LABELS.addMilestone}
                </button>
              ) : null}

              {draft.phases.length > 1 ? (
                <button
                  className={styles.quietAction}
                  type="button"
                  onClick={() =>
                    update((next) => {
                      next.phases.splice(phaseIndex, 1);
                    })
                  }
                >
                  {LABELS.removePhase}
                </button>
              ) : null}
            </fieldset>
          );
        })}

        {draft.phases.length < MAX_PHASES ? (
          <button
            className={styles.quietAction}
            type="button"
            onClick={() =>
              update((next) => {
                next.phases.push(emptyPhase(mint()));
              })
            }
          >
            {LABELS.addPhase}
          </button>
        ) : null}

        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={pending}
          >
            {ROADMAP_CONTROL_COPY.writeSaveAction}
          </button>
          <p className={styles.helper}>
            {replaces
              ? ROADMAP_CONTROL_COPY.writeSupportReplaces
              : ROADMAP_CONTROL_COPY.writeSupport}
          </p>
        </div>
      </form>
    </section>
  );
}

function emptyPhase(key: string): Phase {
  return {
    key,
    title: "",
    focus: "",
    endDate: "",
    goalAttention: [],
    milestones: [],
  };
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Each phase's first day: the roadmap's for the first, the day after the
 * previous one ends for every other. Empty where the date it follows is not
 * a date yet.
 */
export function phaseStarts(draft: {
  startDate: string;
  phases: { endDate: string }[];
}): string[] {
  return draft.phases.map((_, index) => {
    if (index === 0) return draft.startDate;
    const previousEnd = draft.phases[index - 1]!.endDate;
    return isDate(previousEnd) ? shiftIsoDate(previousEnd, 1) : "";
  });
}

/**
 * The roadmap as it is sent: a v4 roadmap with each phase's dates filled in,
 * the last ending with the roadmap, and a blank summary or blank details left
 * out, which is how a roadmap says it has none.
 */
function toContent(draft: Draft, starts: string[]) {
  return {
    schemaVersion: ROADMAP_SCHEMA_VERSION,
    title: draft.title,
    ...(draft.summary.trim() === "" ? {} : { summary: draft.summary }),
    startDate: draft.startDate,
    endDate: draft.endDate,
    phases: draft.phases.map((phase, index) => ({
      title: phase.title,
      focus: phase.focus,
      startDate: starts[index] ?? "",
      endDate:
        index === draft.phases.length - 1 ? draft.endDate : phase.endDate,
      goalAttention: phase.goalAttention.map((attention) => ({
        goalId: attention.goalId,
        level: attention.level,
      })),
      milestones: phase.milestones.map((milestone) => ({
        title: milestone.title,
        targetDate: milestone.targetDate,
        goalIds: milestone.goalIds,
        ...(milestone.details.trim() === ""
          ? {}
          : { observableCriterion: milestone.details }),
      })),
    })),
  };
}
