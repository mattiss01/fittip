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

import {
  editRoadmapAction,
  writeRoadmapAction,
} from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import {
  COACH_START_MAX_DAYS_AHEAD,
  shiftIsoDate,
} from "@/lib/date/local-date";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * A roadmap in a form: written by hand (ADR-029), or a coach proposal being
 * edited. One form for both (owner, 14 Oct 2026), so an edit looks like
 * writing and shows nothing beside it.
 *
 * Written by hand, it starts empty (owner, 13 Oct 2026) and is in force on
 * save. Edited, it opens on the proposal, its two dates fixed because they
 * belong to the request, and saving makes a new proposal to review.
 *
 * Every phase has its own end, typed in any order. A phase's start is shown,
 * not typed: the roadmap's for the first, the day after the one before ends
 * for each next one. Whether the ends add up — each after its start, none past
 * the roadmap, the last on the roadmap's own end — is checked when the owner
 * saves (owner, 14 Oct 2026), and the first thing that does not is said in
 * words naming the phase. The server's validator checks it all again.
 *
 * Goals are chips, with no level (owner, 14 Oct 2026). A goal added here is
 * saved as primary; one the coach gave a level keeps it through an edit. A
 * milestone's goals are chips too, "Counts toward", and may be none.
 *
 * Every block is keyed by an id minted when it is added, so typing a date
 * never rebuilds the block it is in. The draft travels as one JSON field, the
 * encoding an edit has always used.
 */

/** The version a roadmap is written as; the server refuses any other. */
const ROADMAP_SCHEMA_VERSION = "fittip.roadmap.v4";

const MAX_PHASES = 6;
const MAX_GOALS_PER_PHASE = 4;
const MAX_MILESTONES_PER_PHASE = 3;
const MIN_DAYS = 28;
const MAX_DAYS = 365;

const LABELS = ROADMAP_CONTROL_COPY.writeFieldLabels;
const CHECKS = ROADMAP_CONTROL_COPY.writeChecks;

type Level = "primary" | "secondary" | "maintenance" | "deferred";
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
  endDate: string;
  /** The phase's goals in order, each with the level it is saved with. */
  goals: { goalId: string; level: Level }[];
  milestones: Milestone[];
};
export type WriterDraft = {
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  phases: Phase[];
};

export type RoadmapWriterGoal = { id: string; title: string };

/** What an edit opens on: a stored roadmap, which may lack the optional. */
type StoredRoadmap = {
  title: string;
  summary?: string;
  startDate: string;
  endDate: string;
  phases: {
    title: string;
    focus: string;
    endDate: string;
    goalAttention: { goalId: string; level: string }[];
    milestones: {
      title: string;
      observableCriterion?: string;
      targetDate: string;
      goalIds: string[];
    }[];
  }[];
};

export function RoadmapWriter({
  today,
  goals,
  expectedHeadRevision,
  replaces,
  headingId,
  edit,
}: {
  today: string;
  /** The owner's active goals, the only ones a phase may be for. */
  goals: RoadmapWriterGoal[];
  /** The head the page read: a roadmap accepted since refuses the save. */
  expectedHeadRevision: number;
  /** Whether a roadmap is in force, which this one would replace. */
  replaces: boolean;
  headingId?: string;
  /** Present when a coach proposal is being edited rather than written. */
  edit?: {
    proposalId: string;
    content: unknown;
    onCancel: () => void;
    onSaved: () => void;
  };
}) {
  const { state, submit, pending, lostRender } = useRoadmapWrite(
    edit === undefined ? writeRoadmapAction : editRoadmapAction,
  );
  const recovered = useRoadmapRecovered(state.submission === 0);
  const fieldId = useId();

  // In the sheet: held open while the save is under way, and closed once it
  // has landed. An edit tells the dock instead, which shows the new proposal.
  const session = useContext(RoadmapComposeSessionContext);
  const reportPending = session?.setPending;
  const close = session?.close;
  const onSaved = edit?.onSaved;
  useEffect(() => {
    reportPending?.(pending);
    return () => reportPending?.(false);
  }, [reportPending, pending]);
  useEffect(() => {
    if (state.status === "written") close?.();
    if (state.status === "edited") onSaved?.();
  }, [close, onSaved, state.status]);

  const nextKey = useRef(0);
  const mint = () => `k${(nextKey.current += 1)}`;

  const [draft, setDraft] = useState<WriterDraft>(() =>
    edit === undefined
      ? {
          title: "",
          summary: "",
          startDate: today,
          endDate: "",
          phases: [emptyPhase("k0")],
        }
      : fromStored(edit.content as StoredRoadmap),
  );
  // What the last attempt to save found wrong, before anything was sent.
  const [problem, setProblem] = useState("");

  const update = (mutate: (next: WriterDraft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const heading =
    edit === undefined
      ? ROADMAP_CONTROL_COPY.writeTitle
      : ROADMAP_CONTROL_COPY.editTitle;

  if (goals.length === 0) {
    return (
      <section className={styles.card} data-roadmap-write>
        <h2 className={styles.cardHeading} id={headingId}>
          {heading}
        </h2>
        <p className={styles.emptyState}>{ROADMAP_CONTROL_COPY.writeNoGoals}</p>
      </section>
    );
  }

  const goalTitles = new Map(goals.map((goal) => [goal.id, goal.title]));
  const starts = phaseStarts(draft);
  const latestStart = shiftIsoDate(today, COACH_START_MAX_DAYS_AHEAD);
  const datesFixed = edit !== undefined;
  const message =
    problem !== "" ? problem : isRefusal(state) ? state.message : "";

  return (
    // An edit sits in the proposal's own card, so it draws none of its own.
    <section
      className={edit === undefined ? styles.card : undefined}
      data-roadmap-write={edit === undefined ? "write" : "edit"}
    >
      <h2 className={styles.cardHeading} id={headingId}>
        {heading}
      </h2>

      <RoadmapWatchNotice lostRender={lostRender} recovered={recovered} />

      {message === "" ? null : (
        <p
          className={styles.notice}
          data-roadmap-notice={problem !== "" ? "validation" : state.status}
          role="alert"
        >
          {message}
        </p>
      )}

      <form
        action={submit}
        className={styles.form}
        onSubmit={(event) => {
          const found = checkDraft(draft, starts);
          setProblem(found ?? "");
          if (found !== null) event.preventDefault();
        }}
      >
        {edit === undefined ? (
          <input
            type="hidden"
            name="expectedHeadRevision"
            value={expectedHeadRevision}
          />
        ) : (
          <input type="hidden" name="proposalId" value={edit.proposalId} />
        )}
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
              readOnly={datesFixed}
              {...(datesFixed ? {} : { min: today, max: latestStart })}
              required
              onChange={(event) => {
                if (datesFixed) return;
                update((next) => {
                  next.startDate = event.target.value;
                });
              }}
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
              readOnly={datesFixed}
              {...(!datesFixed && isDate(draft.startDate)
                ? {
                    min: shiftIsoDate(draft.startDate, MIN_DAYS),
                    max: shiftIsoDate(draft.startDate, MAX_DAYS),
                  }
                : {})}
              required
              onChange={(event) => {
                if (datesFixed) return;
                update((next) => {
                  next.endDate = event.target.value;
                });
              }}
            />
          </div>
        </div>
        {datesFixed ? (
          <p className={styles.helper}>{ROADMAP_CONTROL_COPY.editDatesFixed}</p>
        ) : null}

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
          const start = starts[phaseIndex] ?? "";
          const id = `${fieldId}-${phase.key}`;
          const chosen = new Set(phase.goals.map((goal) => goal.goalId));

          return (
            <fieldset
              className={styles.editGroup}
              key={phase.key}
              data-roadmap-write-phase={phaseIndex + 1}
            >
              <legend className={styles.editLegend}>
                {LABELS.phase(phaseIndex + 1)}
              </legend>

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

              <div className={styles.dateRow}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`${id}-start`}>
                    {LABELS.phaseStart}
                  </label>
                  {/* Shown, not chosen: it follows from the phase before. */}
                  <input
                    className={styles.input}
                    id={`${id}-start`}
                    type="date"
                    value={start}
                    readOnly
                    tabIndex={-1}
                    aria-describedby={`${id}-start-help`}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`${id}-end`}>
                    {LABELS.phaseEnd}
                  </label>
                  <input
                    className={styles.input}
                    id={`${id}-end`}
                    type="date"
                    value={phase.endDate}
                    required
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex]!.endDate = event.target.value;
                      })
                    }
                  />
                </div>
              </div>
              <p className={styles.helper} id={`${id}-start-help`}>
                {phaseIndex === 0
                  ? LABELS.phaseStartsWithRoadmap
                  : LABELS.phaseStartsAfter(phaseIndex)}
              </p>

              <fieldset className={styles.chipField}>
                <legend className={styles.label}>{LABELS.goals}</legend>
                <div className={styles.chips}>
                  {goals.map((goal) => {
                    const on = chosen.has(goal.id);
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        className={styles.chip}
                        aria-pressed={on}
                        disabled={
                          !on && phase.goals.length >= MAX_GOALS_PER_PHASE
                        }
                        onClick={() =>
                          update((next) => {
                            const target = next.phases[phaseIndex]!;
                            if (on) {
                              target.goals = target.goals.filter(
                                (entry) => entry.goalId !== goal.id,
                              );
                              // A milestone counts toward goals of its phase.
                              for (const milestone of target.milestones) {
                                milestone.goalIds = milestone.goalIds.filter(
                                  (goalId) => goalId !== goal.id,
                                );
                              }
                            } else {
                              target.goals.push({
                                goalId: goal.id,
                                level: "primary",
                              });
                            }
                          })
                        }
                      >
                        {goal.title}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {phase.milestones.map((milestone, milestoneIndex) => {
                const mid = `${id}-${milestone.key}`;
                return (
                  <fieldset
                    className={styles.milestoneEdit}
                    key={milestone.key}
                  >
                    <legend className={styles.editLegend}>
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
                    {phase.goals.length === 0 ? null : (
                      <fieldset className={styles.chipField}>
                        <legend className={styles.label}>
                          {LABELS.milestoneGoals}
                        </legend>
                        <div className={styles.chips}>
                          {phase.goals.map(({ goalId }) => {
                            const on = milestone.goalIds.includes(goalId);
                            return (
                              <button
                                key={goalId}
                                type="button"
                                className={styles.chip}
                                aria-pressed={on}
                                onClick={() =>
                                  update((next) => {
                                    const target =
                                      next.phases[phaseIndex]!.milestones[
                                        milestoneIndex
                                      ]!;
                                    target.goalIds = on
                                      ? target.goalIds.filter(
                                          (entry) => entry !== goalId,
                                        )
                                      : [...target.goalIds, goalId];
                                  })
                                }
                              >
                                {goalTitles.get(goalId) ?? ""}
                              </button>
                            );
                          })}
                        </div>
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
                      className={styles.linkAction}
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

              <div className={styles.inlineActions}>
                {phase.milestones.length < MAX_MILESTONES_PER_PHASE ? (
                  <button
                    className={styles.linkAction}
                    type="button"
                    onClick={() =>
                      update((next) => {
                        next.phases[phaseIndex]!.milestones.push({
                          key: mint(),
                          title: "",
                          targetDate: "",
                          goalIds: [],
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
                    className={styles.linkAction}
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
              </div>
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
            {edit === undefined
              ? ROADMAP_CONTROL_COPY.writeSaveAction
              : ROADMAP_CONTROL_COPY.editSaveAction}
          </button>
          {edit === undefined ? (
            <p className={styles.helper}>
              {replaces
                ? ROADMAP_CONTROL_COPY.writeSupportReplaces
                : ROADMAP_CONTROL_COPY.writeSupport}
            </p>
          ) : (
            <>
              <button
                className={styles.quietAction}
                type="button"
                onClick={edit.onCancel}
                disabled={pending}
              >
                {ROADMAP_CONTROL_COPY.editCancelAction}
              </button>
              <p className={styles.helper}>
                {ROADMAP_CONTROL_COPY.editSupport}
              </p>
            </>
          )}
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
    goals: [],
    milestones: [],
  };
}

const LEVELS: readonly Level[] = [
  "primary",
  "secondary",
  "maintenance",
  "deferred",
];

/**
 * The draft an edit opens on, copied field by field. Whatever a stored row
 * holds beyond v4 is left behind, so what is saved is v4 (ADR-027).
 */
function fromStored(content: StoredRoadmap): WriterDraft {
  let key = 0;
  const mint = () => `s${(key += 1)}`;
  return {
    title: content.title,
    summary: content.summary ?? "",
    startDate: content.startDate,
    endDate: content.endDate,
    phases: content.phases.map((phase) => ({
      key: mint(),
      title: phase.title,
      focus: phase.focus,
      endDate: phase.endDate,
      goals: phase.goalAttention.map((attention) => ({
        goalId: attention.goalId,
        level: (LEVELS as readonly string[]).includes(attention.level)
          ? (attention.level as Level)
          : "primary",
      })),
      milestones: phase.milestones.map((milestone) => ({
        key: mint(),
        title: milestone.title,
        targetDate: milestone.targetDate,
        goalIds: [...milestone.goalIds],
        details: milestone.observableCriterion ?? "",
      })),
    })),
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
 * The first thing about the phases and their dates that would stop the save,
 * in words naming the phase, or null when they add up. Fields the browser
 * itself requires are left to it.
 */
export function checkDraft(
  draft: WriterDraft,
  starts: string[] = phaseStarts(draft),
): string | null {
  for (const [index, phase] of draft.phases.entries()) {
    const number = index + 1;
    const start = starts[index] ?? "";
    if (!isDate(phase.endDate)) return CHECKS.phaseNoEnd(number);
    if (isDate(start) && phase.endDate < start) {
      return CHECKS.phaseEndsBeforeStart(number);
    }
    if (isDate(draft.endDate) && phase.endDate > draft.endDate) {
      return CHECKS.phaseEndsAfterRoadmap(number);
    }
    if (phase.goals.length === 0) return CHECKS.phaseNoGoal(number);
    for (const milestone of phase.milestones) {
      if (
        isDate(milestone.targetDate) &&
        isDate(start) &&
        (milestone.targetDate < start || milestone.targetDate > phase.endDate)
      ) {
        return CHECKS.milestoneOutsidePhase(number);
      }
    }
  }
  const last = draft.phases.at(-1);
  if (
    last !== undefined &&
    isDate(draft.endDate) &&
    last.endDate !== draft.endDate
  ) {
    return CHECKS.lastPhaseEnd(
      draft.phases.length,
      formatRoadmapDate(draft.endDate),
    );
  }
  return null;
}

/**
 * The roadmap as it is sent: a v4 roadmap with each phase's start filled in,
 * and a blank summary or blank details left out, which is how a roadmap says
 * it has none.
 */
function toContent(draft: WriterDraft, starts: string[]) {
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
      endDate: phase.endDate,
      goalAttention: phase.goals.map((goal) => ({
        goalId: goal.goalId,
        level: goal.level,
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
