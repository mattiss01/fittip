"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./activity-editor.module.css";
import { MeasurementFields, MeasurementModeField } from "./measurement-fields";
import { ReorderHandle } from "./reorder-handle";

import { activityNameKey } from "@/lib/training/activity-name";
import { describeMeasurement } from "@/lib/training/describe-measurement";
import {
  type TrainingMeasurement,
  type TrainingMeasurementMode,
} from "@/lib/training/measurement";
import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";
import {
  buildMeasurement,
  draftFromMeasurement,
  emptyDraft,
  type MeasurementDraft,
} from "@/lib/training/measurement-draft";

/** One activity as the surrounding surface already holds it. */
export type ActivityValue = {
  /**
   * The library definition this row was copied from, or null. Every editor
   * submits it back unchanged, because an edit replaces the whole list and a
   * row that dropped it would lose the link for good (A5). Changing the row's
   * fields keeps it: the link says where the row came from, not that the two
   * still agree.
   */
  personalActivityId: string | null;
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: TrainingMeasurementMode;
  target: TrainingMeasurement | null;
};

type Row = ActivityValue & {
  /** Stable across reorders, which is what keeps inputs from swapping. */
  key: string;
  draft: MeasurementDraft;
};

let nextKey = 0;

/** A library definition, as the picker offers it. */
export type LibraryActivityOption = Omit<
  ActivityValue,
  "personalActivityId"
> & {
  id: string;
};

/** What saving a row as a new library definition answers. */
export type SaveToLibraryResult =
  | { status: "saved"; message: string; personalActivityId: string }
  | { status: "refused"; message: string };

/**
 * A server action, handed down by the page. The shared editor does not import
 * one itself, so it depends on no route.
 */
export type SaveToLibrary = (
  activity: Omit<LibraryActivityOption, "id">,
) => Promise<SaveToLibraryResult>;

type ActivityLibrary = {
  activities: readonly LibraryActivityOption[];
  saveToLibrary?: SaveToLibrary;
};

const ActivityLibraryContext = createContext<ActivityLibrary>({
  activities: [],
});

/**
 * The owner's personal activities, for every `ActivityEditor` below it. A
 * context rather than a prop, because the Plan's editors sit several
 * components deep in create, edit and recurring forms that have no other use
 * for the list.
 */
export function ActivityLibraryProvider({
  activities,
  saveToLibrary,
  children,
}: {
  activities: readonly LibraryActivityOption[];
  /** Absent where a surface offers no way to save a row into the library. */
  saveToLibrary?: SaveToLibrary;
  children: React.ReactNode;
}) {
  return (
    <ActivityLibraryContext value={{ activities, saveToLibrary }}>
      {children}
    </ActivityLibraryContext>
  );
}

/**
 * The ordered activities of one session.
 *
 * It writes a single hidden field — JSON, not indexed input names — because
 * the list is reorderable. With `activity.3.name` the server would have to
 * cope with gaps and repeats after a drag, and the drag would have to rewrite
 * every field's name to close them. One serialized value has one meaning, and
 * `readActivities` on the server parses it under the same suspicion it gives
 * any other form value.
 *
 * A row whose measurement cannot be built sets a real `setCustomValidity` on
 * its own first field, so the browser refuses the submit and says why. The
 * row is forced open at the same time: a validity message on a control inside
 * a closed `details` is one the owner cannot see and the browser cannot focus.
 */
export function ActivityEditor({
  idPrefix,
  name = "activities",
  initial,
  sessionSport,
}: {
  idPrefix: string;
  name?: string;
  initial?: ActivityValue[];
  /**
   * What the session itself is, live from the form above. A new row takes it
   * rather than asking again — most activities are the sport of the session
   * that holds them. The field stays, because some are not: a bike spin-down
   * inside a strength session is the case that would be lost if the column
   * were simply filled in for you.
   */
  sessionSport?: string;
}) {
  const generatedId = useId();
  const prefix = idPrefix || generatedId;
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((activity) => ({
      ...activity,
      key: `initial-${nextKey++}`,
      draft: draftFromMeasurement(activity.measurementMode, activity.target),
    })),
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const { activities: library, saveToLibrary } = useContext(
    ActivityLibraryContext,
  );
  // Definitions this editor saved, until the page's refresh brings them in
  // with the rest. Without them a row saved a moment ago would read as linked
  // to nothing and offer the save again.
  const [savedHere, setSavedHere] = useState<LibraryActivityOption[]>([]);
  const known = new Map(
    [...library, ...savedHere].map((option) => [option.id, option]),
  );
  const takenNames = new Set(
    [...known.values()].map((option) => activityNameKey(option.name)),
  );
  const [picking, setPicking] = useState(false);

  const built = useMemo(
    () =>
      rows.map((row) => ({
        row,
        build: buildMeasurement(row.measurementMode, row.draft),
      })),
    [rows],
  );

  // Only the rows that can be built are serialized. A row that cannot is
  // already blocking the submit, so what this field holds while that is true
  // never reaches a server action.
  const serialized = JSON.stringify(
    built.map(({ row, build }) => ({
      // No `position` and no `isLocked`. The array's order is the position,
      // and `parseSubmittedActivities` refuses a payload that names either —
      // a field no surface sets is one no submission should carry.
      personalActivityId: row.personalActivityId,
      name: row.name.trim(),
      sport: row.sport.trim(),
      instructions: trimmedInstructions(row.instructions),
      measurementMode: row.measurementMode,
      target: build.ok ? build.measurement : null,
    })),
  );

  function update(key: string, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function move(key: string, delta: number) {
    setRows((current) => {
      const from = current.findIndex((row) => row.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [held] = next.splice(from, 1);
      next.splice(to, 0, held);
      return next;
    });
  }

  /**
   * Offered to any row the library does not already hold as it is: one typed
   * by hand, one whose definition was removed, or one picked and then changed
   * — a similar exercise is a new definition (owner, 27 Sep 2026). A row still
   * equal to its definition would only be a twin, so it is offered nothing.
   * One whose name is already taken is told to rename rather than offered a
   * save the database would refuse; names are unique in the library.
   */
  function saveOffer(
    row: Row,
    measurement: TrainingMeasurement | null | undefined,
  ): Pick<ActivityRowProps, "onSave" | "saveBlocked"> {
    if (saveToLibrary === undefined || measurement === undefined) return {};
    const definition = toDefinition(row, measurement);
    if (
      matchesDefinition(
        row.personalActivityId === null
          ? undefined
          : known.get(row.personalActivityId),
        definition,
      )
    ) {
      return {};
    }
    if (takenNames.has(activityNameKey(definition.name))) {
      return { saveBlocked: ACTIVITY_COPY.nameTaken(definition.name) };
    }
    return {
      onSave: async () => {
        const result = await saveToLibrary(definition);
        if (result.status === "saved") {
          setSavedHere((current) => [
            ...current,
            { id: result.personalActivityId, ...definition },
          ]);
          update(row.key, { personalActivityId: result.personalActivityId });
        }
        return result;
      },
    };
  }

  const atLimit = rows.length >= ACTIVITY_COPY.softLimit;

  return (
    <section className={styles.editor} aria-labelledby={`${prefix}-activities`}>
      <div className={styles.head}>
        <h3 id={`${prefix}-activities`}>Activities</h3>
        <p className={styles.count}>
          {rows.length === 0
            ? "None"
            : `${rows.length} of ${ACTIVITY_COPY.softLimit}`}
        </p>
      </div>

      <input type="hidden" name={name} value={serialized} />

      {rows.length === 0 ? (
        <p className={styles.empty}>{ACTIVITY_COPY.empty}</p>
      ) : (
        <ol className={styles.rows}>
          {built.map(({ row, build }, index) => (
            <ActivityRow
              key={row.key}
              idPrefix={`${prefix}-activity-${index}`}
              row={row}
              index={index}
              total={rows.length}
              problem={build.ok ? null : build.message}
              preview={build.ok ? describeMeasurement(build.measurement) : null}
              dragging={dragging === row.key}
              onDragStateChange={setDragging}
              {...saveOffer(row, build.ok ? build.measurement : undefined)}
              onChange={(change) => update(row.key, change)}
              onMove={(delta) => move(row.key, delta)}
              onMoveTo={(to) =>
                setRows((current) => {
                  const from = current.findIndex(
                    (item) => item.key === row.key,
                  );
                  if (from < 0 || to < 0 || to >= current.length || from === to)
                    return current;
                  const next = [...current];
                  const [held] = next.splice(from, 1);
                  next.splice(to, 0, held);
                  return next;
                })
              }
              onRemove={() =>
                setRows((current) =>
                  current.filter((item) => item.key !== row.key),
                )
              }
            />
          ))}
        </ol>
      )}

      <div className={styles.addRow}>
        <button
          className={styles.add}
          type="button"
          disabled={atLimit}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: `added-${nextKey++}`,
                personalActivityId: null,
                name: "",
                sport: (sessionSport ?? "").trim(),
                instructions: null,
                measurementMode: "unmeasured",
                target: null,
                draft: emptyDraft("unmeasured"),
              },
            ])
          }
        >
          {ACTIVITY_COPY.add}
        </button>
        {library.length === 0 ? null : (
          <button
            className={styles.add}
            type="button"
            disabled={atLimit}
            aria-expanded={picking}
            aria-controls={`${prefix}-library`}
            onClick={() => setPicking((current) => !current)}
          >
            {ACTIVITY_COPY.addFromLibrary}
          </button>
        )}
      </div>
      {picking && !atLimit ? (
        <ul
          className={styles.picker}
          id={`${prefix}-library`}
          aria-label={ACTIVITY_COPY.libraryLabel}
        >
          {library.map((option) => (
            <li key={option.id}>
              <button
                className={styles.pick}
                type="button"
                onClick={() => {
                  // A copy by value, as the Plan's reuse is: the row holds
                  // these values from now on, and later edits to the
                  // definition never reach it.
                  setRows((current) => [
                    ...current,
                    {
                      key: `picked-${nextKey++}`,
                      personalActivityId: option.id,
                      name: option.name,
                      sport: option.sport,
                      instructions: option.instructions,
                      measurementMode: option.measurementMode,
                      target: option.target,
                      draft: draftFromMeasurement(
                        option.measurementMode,
                        option.target,
                      ),
                    },
                  ]);
                  setPicking(false);
                }}
              >
                <span className={styles.summaryName}>{option.name}</span>
                <span className={styles.summaryTarget}>
                  {describeMeasurement(option.target) ?? option.sport}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {atLimit ? <p className={styles.limit}>{ACTIVITY_COPY.atLimit}</p> : null}
    </section>
  );
}

type ActivityRowProps = {
  idPrefix: string;
  row: Row;
  index: number;
  total: number;
  problem: string | null;
  preview: string | null;
  dragging: boolean;
  onDragStateChange: (key: string | null) => void;
  /** Present only when this row can be saved into the library. */
  onSave?: () => Promise<SaveToLibraryResult>;
  /** Why a row that differs from the library still cannot be saved into it. */
  saveBlocked?: string;
  onChange: (change: Partial<Row>) => void;
  onMove: (delta: number) => void;
  onMoveTo: (index: number) => void;
  onRemove: () => void;
};

function ActivityRow({
  idPrefix,
  row,
  index,
  total,
  problem,
  preview,
  dragging,
  onDragStateChange,
  onSave,
  saveBlocked,
  onChange,
  onMove,
  onMoveTo,
  onRemove,
}: ActivityRowProps) {
  const [expanded, setExpanded] = useState(row.name === "");

  // A row that cannot be built is open whatever the owner last chose, rather
  // than being forced open by an effect: the browser is about to refuse the
  // submit and point at a control inside this body, and a validity message on
  // something hidden is one nobody can read and nothing can focus. Derived, so
  // collapsing a broken row simply does not take — which is the honest
  // behaviour, and costs no cascading render to express.
  const open = expanded || problem !== null;
  const [saving, setSaving] = useState(false);
  // Held here rather than derived, because a save links the row, which takes
  // the button away — and the answer has to outlive the button that asked.
  const [saveNotice, setSaveNotice] = useState<SaveToLibraryResult | null>(
    null,
  );
  const canSave =
    onSave !== undefined && row.name.trim() !== "" && row.sport.trim() !== "";

  return (
    <li
      className={dragging ? `${styles.row} ${styles.rowDragging}` : styles.row}
      data-activity-row={index}
    >
      <div className={styles.rowHead}>
        <ReorderHandle
          label={`${ACTIVITY_COPY.reorderHint} Activity ${index + 1} of ${total}.`}
          onDragStateChange={(active) =>
            onDragStateChange(active ? row.key : null)
          }
          onMove={onMove}
          onMoveTo={onMoveTo}
        />
        <button
          className={styles.summary}
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className={styles.summaryName}>
            {row.name.trim() === "" ? "New activity" : row.name}
          </span>
          <span className={styles.summaryTarget}>
            {problem ?? preview ?? ACTIVITY_COPY.noTarget}
          </span>
        </button>
        <button className={styles.remove} type="button" onClick={onRemove}>
          {ACTIVITY_COPY.remove}
        </button>
      </div>

      <div hidden={!open} className={styles.rowBody}>
        <ActivityFields
          idPrefix={idPrefix}
          value={row}
          problem={problem}
          onChange={onChange}
        />
        {canSave ? (
          <button
            className={styles.add}
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                setSaveNotice(await onSave());
              } catch {
                setSaveNotice({
                  status: "refused",
                  message: ACTIVITY_COPY.saveToLibraryFailed,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving
              ? ACTIVITY_COPY.savingToLibrary
              : ACTIVITY_COPY.saveToLibrary}
          </button>
        ) : null}
        {saveBlocked === undefined ? null : (
          <p className={styles.hint}>{saveBlocked}</p>
        )}
        {saveNotice === null ? null : (
          <p className={styles.hint} role="status">
            {saveNotice.message}
          </p>
        )}
      </div>
    </li>
  );
}

/** A row's values as a library definition would hold them. */
function toDefinition(
  row: Row,
  measurement: TrainingMeasurement | null,
): Omit<LibraryActivityOption, "id"> {
  return {
    name: row.name.trim(),
    sport: row.sport.trim(),
    instructions: trimmedInstructions(row.instructions),
    measurementMode: row.measurementMode,
    target: measurement,
  };
}

/** Instructions as they are stored: trimmed, and absent rather than blank. */
function trimmedInstructions(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value.trim();
}

/** Whether saving `value` would only repeat `definition`. */
function matchesDefinition(
  definition: LibraryActivityOption | undefined,
  value: Omit<LibraryActivityOption, "id">,
): boolean {
  if (definition === undefined) return false;
  return (
    definition.name === value.name &&
    definition.sport === value.sport &&
    (definition.instructions ?? null) === value.instructions &&
    definition.measurementMode === value.measurementMode &&
    canonical(definition.target) === canonical(value.target)
  );
}

/** JSON with sorted keys, so two equal measurements compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).toSorted(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : inner,
  );
}

/** The fields one activity is edited through, wherever it is held. */
export type ActivityFieldsValue = {
  name: string;
  sport: string;
  instructions: string | null;
  measurementMode: TrainingMeasurementMode;
  draft: MeasurementDraft;
};

/**
 * One activity's inputs: a session's row here, and a library definition in
 * `ActivityDefinitionEditor`, so the two can never offer different fields.
 */
export function ActivityFields({
  idPrefix,
  value,
  problem,
  sportHint = ACTIVITY_COPY.sportHint,
  onChange,
}: {
  idPrefix: string;
  value: ActivityFieldsValue;
  /** A session's row takes its sport from the session; a definition does not. */
  sportHint?: string | null;
  /** Why the measurement cannot be built, or null when it can. */
  problem: string | null;
  onChange: (change: Partial<ActivityFieldsValue>) => void;
}) {
  const validityRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    validityRef.current?.setCustomValidity(problem ?? "");
  }, [problem]);

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          value={value.name}
          maxLength={120}
          required
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-sport`}>Sport</label>
        <input
          id={`${idPrefix}-sport`}
          value={value.sport}
          maxLength={80}
          required
          onChange={(event) => onChange({ sport: event.target.value })}
        />
        {sportHint === null ? null : <p className={styles.hint}>{sportHint}</p>}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-instructions`}>Instructions</label>
        <textarea
          id={`${idPrefix}-instructions`}
          value={value.instructions ?? ""}
          maxLength={2000}
          rows={2}
          onChange={(event) => onChange({ instructions: event.target.value })}
        />
      </div>
      <MeasurementModeField
        id={`${idPrefix}-mode`}
        mode={value.measurementMode}
        // The draft is replaced rather than carried across: the modes share
        // no field, so keeping the old one would leave values nothing in the
        // new mode reads.
        onChange={(mode) =>
          onChange({ measurementMode: mode, draft: emptyDraft(mode) })
        }
      />

      <MeasurementFields
        idPrefix={idPrefix}
        mode={value.measurementMode}
        draft={value.draft}
        validityRef={validityRef}
        onDraftChange={(field, fieldValue) =>
          onChange({
            draft: {
              ...value.draft,
              fields: { ...value.draft.fields, [field]: fieldValue },
            },
          })
        }
        onGroupsChange={(groups) =>
          onChange({ draft: { ...value.draft, groups } })
        }
      />

      {problem === null ? null : (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
