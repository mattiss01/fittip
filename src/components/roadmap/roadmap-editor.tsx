"use client";

import { useState, useTransition } from "react";

import type { RoadmapActionState } from "@/app/home/plan/roadmap/action-state";
import { editRoadmapAction } from "@/app/home/plan/roadmap/actions";
import styles from "@/app/home/plan/roadmap/roadmap.module.css";

/**
 * The structured editor (decision 4): fields, never raw JSON.
 *
 * An owner edits the words and the dates. They do not edit the owner id, the
 * source ids and revisions, the schema, prompt or model codes, the validation
 * state, the idempotency data, or the server-owned safety copy — none of which
 * appears in this form, so an edit that tried to change one would have nowhere
 * to put it.
 *
 * The result is submitted as content and revalidated server-side by the same
 * validator the model's own output goes through, then bounded again by the
 * database. Saving creates a **new** proposal linked to this one; nothing here
 * rewrites the proposal being edited.
 */

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

const LEVELS = ["primary", "secondary", "maintenance", "deferred"] as const;

export function RoadmapEditor({
  proposalId,
  content,
  onClose,
  onSaving,
}: {
  proposalId: string;
  content: unknown;
  onClose: (result: RoadmapActionState | null) => void;
  /**
   * Reported up so the surface's lost-render watchdog covers this step too.
   * An edit posts to the same route through the same kind of transition, so it
   * can stall the same way, and the watchdog cannot see a transition that
   * belongs to a component below it.
   */
  onSaving: (saving: boolean) => void;
}) {
  // Cloned once so an abandoned edit leaves the reviewed proposal untouched in
  // the surrounding screen as well as in the database.
  const [draft, setDraft] = useState<Draft>(() =>
    structuredClone(content as Draft),
  );
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState("");

  const update = (mutate: (next: Draft) => void) => {
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const save = () => {
    onSaving(true);
    startSaving(async () => {
      // `schemaVersion` is added back server-side from the accepted contract,
      // never from this form.
      const result = await editRoadmapAction(proposalId, {
        ...draft,
        schemaVersion: "fittip.roadmap.v2",
      });
      onSaving(false);
      if (result.status === "edited") {
        onClose(result);
        return;
      }
      setMessage(result.message);
    });
  };

  return (
    <section className={styles.card} aria-label="Edit proposal">
      <h2 className={styles.cardHeading}>Edit proposal</h2>
      <p className={styles.helper}>
        Saving creates a new proposal to review. The one you are editing stays
        in your history exactly as the coach wrote it.
      </p>

      {message ? (
        <p className={styles.notice} data-tone="warning" role="alert">
          {message}
        </p>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>Roadmap title</span>
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
        <span className={styles.label}>Summary</span>
        <textarea
          className={styles.textarea}
          value={draft.summary}
          maxLength={600}
          onChange={(event) =>
            update((next) => {
              next.summary = event.target.value;
            })
          }
        />
      </label>

      {draft.phases.map((phase, phaseIndex) => (
        <fieldset key={phaseIndex} className={styles.disclosure}>
          <legend className={styles.disclosureSummary}>
            Phase {phaseIndex + 1}
          </legend>
          <div className={styles.disclosureBody}>
            <label className={styles.field}>
              <span className={styles.label}>Title</span>
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
              <span className={styles.label}>Focus</span>
              <textarea
                className={styles.textarea}
                value={phase.focus}
                maxLength={300}
                onChange={(event) =>
                  update((next) => {
                    next.phases[phaseIndex].focus = event.target.value;
                  })
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Starts</span>
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
              <span className={styles.label}>Ends</span>
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
              <div key={attention.goalId}>
                <label className={styles.field}>
                  <span className={styles.label}>Attention</span>
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
                  <span className={styles.label}>Why</span>
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
              <div key={milestoneIndex}>
                <label className={styles.field}>
                  <span className={styles.label}>Milestone</span>
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
                  <span className={styles.label}>What would be observed</span>
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
                  <span className={styles.label}>Aim for by</span>
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
          </div>
        </fieldset>
      ))}

      {(draft.reviewPoints ?? []).map((point, index) => (
        <fieldset key={index} className={styles.disclosure}>
          <legend className={styles.disclosureSummary}>
            Review point {index + 1}
          </legend>
          <div className={styles.disclosureBody}>
            <label className={styles.field}>
              <span className={styles.label}>Title</span>
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
              <span className={styles.label}>Question to reconsider</span>
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
          </div>
        </fieldset>
      ))}

      <div className={styles.actions}>
        <button
          className={styles.primaryAction}
          type="button"
          onClick={save}
          disabled={saving}
        >
          Save as a new proposal
        </button>
        <button
          className={styles.quietAction}
          type="button"
          onClick={() => onClose(null)}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
