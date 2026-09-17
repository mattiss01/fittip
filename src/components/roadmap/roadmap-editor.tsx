"use client";

import { useRef, useState, type FormEvent } from "react";

import { INITIAL_ROADMAP_ACTION_STATE } from "@/app/home/plan/roadmap/action-state";
import { editRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";
import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * The structured editor (ADR-014 decision 4): fields, never raw JSON.
 *
 * An owner edits the words and the dates. They do not edit the owner id, the
 * source ids and revisions, the schema, prompt or model codes, the validation
 * state, the idempotency data, or the server-owned safety copy — none of which
 * appears in this form, so an edit that tried to change one would have nowhere
 * to put it. What is submitted is revalidated server-side by the same validator
 * the coach's own output goes through, and bounded again by the database.
 *
 * Saving creates a **new** proposal linked to this one. Nothing here rewrites
 * the proposal being edited, and the draft is cloned on mount so abandoning an
 * edit leaves the reviewed proposal untouched on screen as well as in the
 * database.
 *
 * ## Why saving reloads the document
 *
 * An edit is the one write that replaces the open proposal under a control
 * that stays on screen, and every App Router route back to a fresh tree failed
 * for it in the browser flow while working for the other three writes: a
 * transition-wrapped call, a form action, a same-route redirect, and a dock
 * keyed by proposal. In every case the edit committed — the server answered,
 * and a reload showed the new proposal at once — and in every case the screen
 * kept the editor open with its submission pending.
 *
 * Two things were proven to work, so this does exactly those two. The action is
 * awaited directly, outside any transition, which resolved reliably from the
 * first attempt; and a successful save then loads the document again, which
 * cannot be served a stale tree or left mid-transition. A refusal is rendered
 * in place, with the draft intact, because that is the case the owner has to
 * act on here.
 *
 * The draft travels as one JSON field, the encoding that survives a nested
 * shape without the server reassembling it from flattened field names.
 */

const LEVELS = ["primary", "secondary", "maintenance", "deferred"] as const;

const LABELS = ROADMAP_CONTROL_COPY.editFieldLabels;

type Attention = { goalId: string; level: string; reason: string };
type Milestone = {
  title: string;
  observableCriterion: string;
  targetDate: string;
  goalIds: string[];
};
type Phase = {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  goalAttention: Attention[];
  milestones: Milestone[];
};
type ReviewPoint = {
  title: string;
  triggerDate?: string;
  triggerCondition?: string;
  question: string;
};
type Draft = {
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  phases: Phase[];
  assumptions?: string[];
  uncertainties?: {
    statement: string;
    whyItMatters: string;
    whatToWatch: string;
  }[];
  reviewPoints: ReviewPoint[];
  safetyConsiderations?: string[];
};

export function RoadmapEditor({
  proposalId,
  content,
  goalTitles,
  onCancel,
}: {
  proposalId: string;
  content: unknown;
  /** Goal id to title, so an attention row names a goal rather than a uuid. */
  goalTitles: Record<string, string>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const submission = useRef(INITIAL_ROADMAP_ACTION_STATE);
  const [draft, setDraft] = useState<Draft>(() =>
    structuredClone(content as Draft),
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await editRoadmapAction(
        submission.current,
        new FormData(event.currentTarget),
      );
      submission.current = result;
      if (result.status === "edited") {
        // A full load rather than a router navigation, for the reason above.
        // The button stays disabled until the new document replaces this one.
        globalThis.location.assign("/home/plan/roadmap");
        return;
      }
      setMessage(result.message);
    } catch {
      setMessage(ROADMAP_CONTROL_COPY.outcomes.decisionFailed);
    }
    setSaving(false);
  }

  const update = (mutate: (next: Draft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  return (
    <section
      className={styles.card}
      aria-label={ROADMAP_CONTROL_COPY.editTitle}
    >
      <h2 className={styles.cardHeading}>{ROADMAP_CONTROL_COPY.editTitle}</h2>
      <p className={styles.emptyState}>{ROADMAP_CONTROL_COPY.editSupport}</p>

      {message === "" ? null : (
        <p
          className={styles.notice}
          data-roadmap-notice="validation"
          role="alert"
        >
          {message}
        </p>
      )}

      <form onSubmit={save} className={styles.form}>
        <input type="hidden" name="proposalId" value={proposalId} />
        {/* `schemaVersion` is added back server-side from the accepted
            contract, never from this form, and the whole draft is revalidated
            there by the validator the coach's own output goes through. */}
        <input
          type="hidden"
          name="content"
          value={JSON.stringify({
            ...draft,
            schemaVersion: "fittip.roadmap.v2",
          })}
        />

        <label className={styles.field}>
          <span className={styles.label}>{LABELS.title}</span>
          <input
            className={styles.input}
            value={draft.title}
            maxLength={80}
            onChange={(event) =>
              update((next) => {
                next.title = event.target.value;
              })
            }
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{LABELS.summary}</span>
          <textarea
            className={styles.textarea}
            value={draft.summary}
            maxLength={600}
            rows={4}
            onChange={(event) =>
              update((next) => {
                next.summary = event.target.value;
              })
            }
          />
        </label>

        {draft.phases.map((phase, phaseIndex) => (
          <fieldset
            className={styles.editGroup}
            key={`${phase.startDate}-${phaseIndex}`}
          >
            <legend className={styles.editLegend}>
              {LABELS.phase(phaseIndex + 1)}
            </legend>

            <label className={styles.field}>
              <span className={styles.label}>{LABELS.phaseTitle}</span>
              <input
                className={styles.input}
                value={phase.title}
                maxLength={80}
                onChange={(event) =>
                  update((next) => {
                    next.phases[phaseIndex].title = event.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{LABELS.phaseFocus}</span>
              <textarea
                className={styles.textarea}
                value={phase.focus}
                maxLength={300}
                rows={3}
                onChange={(event) =>
                  update((next) => {
                    next.phases[phaseIndex].focus = event.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{LABELS.phaseStart}</span>
              <input
                className={styles.input}
                type="date"
                value={phase.startDate}
                onChange={(event) =>
                  update((next) => {
                    next.phases[phaseIndex].startDate = event.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{LABELS.phaseEnd}</span>
              <input
                className={styles.input}
                type="date"
                value={phase.endDate}
                onChange={(event) =>
                  update((next) => {
                    next.phases[phaseIndex].endDate = event.target.value;
                  })
                }
              />
            </label>

            {phase.goalAttention.map((attention, attentionIndex) => (
              <div className={styles.editRow} key={attention.goalId}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {LABELS.attention} · {goalTitles[attention.goalId] ?? ""}
                  </span>
                  <select
                    className={styles.input}
                    value={attention.level}
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex].goalAttention[
                          attentionIndex
                        ].level = event.target.value;
                      })
                    }
                  >
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{LABELS.attentionReason}</span>
                  <input
                    className={styles.input}
                    value={attention.reason}
                    maxLength={160}
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex].goalAttention[
                          attentionIndex
                        ].reason = event.target.value;
                      })
                    }
                  />
                </label>
              </div>
            ))}

            {phase.milestones.map((milestone, milestoneIndex) => (
              <div
                className={styles.editRow}
                key={`${phaseIndex}-milestone-${milestoneIndex}`}
              >
                <label className={styles.field}>
                  <span className={styles.label}>{LABELS.milestone}</span>
                  <input
                    className={styles.input}
                    value={milestone.title}
                    maxLength={80}
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex].milestones[
                          milestoneIndex
                        ].title = event.target.value;
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {LABELS.milestoneCriterion}
                  </span>
                  <input
                    className={styles.input}
                    value={milestone.observableCriterion}
                    maxLength={200}
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex].milestones[
                          milestoneIndex
                        ].observableCriterion = event.target.value;
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{LABELS.milestoneDate}</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={milestone.targetDate}
                    onChange={(event) =>
                      update((next) => {
                        next.phases[phaseIndex].milestones[
                          milestoneIndex
                        ].targetDate = event.target.value;
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </fieldset>
        ))}

        {draft.reviewPoints.map((point, index) => (
          <fieldset className={styles.editGroup} key={`review-${index}`}>
            <legend className={styles.editLegend}>
              {LABELS.reviewPoint(index + 1)}
            </legend>
            <label className={styles.field}>
              <span className={styles.label}>{LABELS.reviewPointTitle}</span>
              <input
                className={styles.input}
                value={point.title}
                maxLength={200}
                onChange={(event) =>
                  update((next) => {
                    next.reviewPoints[index].title = event.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{LABELS.reviewPointQuestion}</span>
              <input
                className={styles.input}
                value={point.question}
                maxLength={200}
                onChange={(event) =>
                  update((next) => {
                    next.reviewPoints[index].question = event.target.value;
                  })
                }
              />
            </label>
          </fieldset>
        ))}

        <div className={styles.actions}>
          <button
            className={styles.primaryAction}
            type="submit"
            disabled={saving}
          >
            {ROADMAP_CONTROL_COPY.editSaveAction}
          </button>
          <button
            className={styles.quietAction}
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            {ROADMAP_CONTROL_COPY.editCancelAction}
          </button>
        </div>
      </form>
    </section>
  );
}
