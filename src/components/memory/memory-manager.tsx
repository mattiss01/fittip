"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  INITIAL_MEMORY_ACTION_STATE,
  type MemoryActionDraft,
  type MemoryActionState,
} from "@/app/home/you/memory/action-state";
import { changeMemoryAction } from "@/app/home/you/memory/actions";
import styles from "@/app/home/you/memory/memory.module.css";
// The timing rules are not memory-specific: this surface reproduces the same
// App Router defect as goals, roadmap and the plan proposal (see
// `useMutationStall` below), so all four share one module.
import {
  latestActionResponseAt,
  RECOVERY_NOTICE_MS,
  watchTransition,
  WATCH_INTERVAL_MS,
  type TransitionWatch,
} from "@/lib/app-router/transition-watchdog";

export type MemoryRevisionView = {
  id: string;
  revisionNumber: number;
  content: string;
  authorClass: "user" | "system";
  provenance: string;
  changeKind: string;
  statusAfter: string;
  createdAt: string;
};

export type MemoryView = {
  id: string;
  memoryType: "profile_fact" | "constraint" | "preference" | "observed_pattern";
  status: "active" | "proposed" | "rejected" | "archived";
  provenance: string;
  confidence: number | null;
  sourceReference: string | null;
  expiresOn: string | null;
  userConfirmedAt: string | null;
  content: string;
  revisionNumber: number;
  history: MemoryRevisionView[];
};

type Props = {
  items: MemoryView[];
  expectedRevision: number;
  today: string;
};

type Filter =
  | "all"
  | "active"
  | "proposed"
  | "review-due"
  | "archived"
  | "rejected";

type CardState = "active" | "proposed" | "review-due" | "archived" | "rejected";

const TYPE_LABELS: Record<MemoryView["memoryType"], string> = {
  profile_fact: "Fact",
  constraint: "Constraint",
  preference: "Preference",
  observed_pattern: "Observed pattern",
};

const TYPE_ORDER: MemoryView["memoryType"][] = [
  "profile_fact",
  "constraint",
  "preference",
  "observed_pattern",
];

const GROUP_HEADINGS: Record<MemoryView["memoryType"], string> = {
  profile_fact: "Facts",
  constraint: "Constraints",
  preference: "Preferences",
  observed_pattern: "Observed patterns",
};

const STAMPS: Record<CardState, string> = {
  active: "Active",
  proposed: "Proposed · needs your review",
  "review-due": "Review due",
  archived: "Disabled",
  rejected: "Declined",
};

const PROVENANCE_LABELS: Record<string, string> = {
  user_created: "Stated by you",
  intake_confirmed: "Confirmed during intake",
  inferred_proposed: "Proposed from your records",
};

const CHANGE_LABELS: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  accepted: "Accepted",
  edited_and_accepted: "Edited and accepted",
  rejected: "Declined",
  disabled: "Disabled",
  enabled: "Enabled",
  renewed: "Review date updated",
};

const SAFETY_NOTICE =
  "If a symptom is severe, sudden or getting worse, stop training and speak to a qualified health professional. FitTip stores what you write here; it does not assess symptoms and gives no medical advice.";

const DELETE_CONSEQUENCE =
  "This erases the current text and every earlier version of it, and cannot be undone. A dated record that a deletion happened stays, without the text.";

/**
 * Session-scoped, non-personal, versioned marker that survives the recovery
 * reload. It carries no memory content, only the fact that the reload was
 * self-triggered.
 */
const RECOVERY_FLAG = "fittip.memory.recovered:v1";

const RECOVERED_NOTICE =
  "Your last memory change did not appear, so this page was reloaded. What you see below is what is saved.";

export function MemoryManager({ items, expectedRevision, today }: Props) {
  const [state, action, pending] = useActionState(
    changeMemoryAction,
    INITIAL_MEMORY_ACTION_STATE,
  );
  const [filter, setFilter] = useState<Filter>("all");
  // The Add-memory form is remounted to clear it, so its key must move only
  // when a *create* settles. Keying it on the shared submission counter would
  // throw away an unsaved draft whenever any other card completed an action —
  // disable, accept, delete — with no warning. Sticky rather than derived,
  // because `state.operation` reverts to another card's operation on the next
  // action and a plain expression would flip the key back and lose the draft
  // just the same.
  const [createdAt, setCreatedAt] = useState(0);
  if (state.operation === "create" && state.submission !== createdAt) {
    setCreatedAt(state.submission);
  }
  const stall = useMutationStall(pending, state.submission);
  const recovered = useRecoveredReload(state.submission);
  const notice =
    stallNotice(stall) ??
    (pending ? "Saving memory change…" : null) ??
    (recovered ? RECOVERED_NOTICE : null);
  const noticeState = stall ?? (recovered ? "recovered" : state.status);

  const stated = items.map((item) => ({ item, state: cardState(item, today) }));
  const counts = countByState(stated);
  const visible =
    filter === "all"
      ? stated
      : stated.filter((entry) => entry.state === filter);
  const proposed = visible.filter((entry) => entry.state === "proposed");
  const reviewDue = visible.filter((entry) => entry.state === "review-due");
  const active = visible.filter((entry) => entry.state === "active");
  const archived = visible.filter((entry) => entry.state === "archived");
  const rejected = visible.filter((entry) => entry.state === "rejected");

  return (
    <div className={styles.manager}>
      <p
        className={noticeState === "idle" ? styles.srOnly : styles.notice}
        data-state={noticeState}
        role="status"
        aria-live="polite"
      >
        {notice ?? state.message}
      </p>
      {state.status === "conflict" || stall === "unconfirmed" ? (
        <a className={styles.reload} href="/home/you/memory">
          Reload current memory
        </a>
      ) : null}

      <div className={styles.filters} role="group" aria-label="Filter memory">
        {(
          [
            ["all", "Everything", items.length],
            ["active", "Active", counts.active],
            ["proposed", "Proposed", counts.proposed],
            ["review-due", "Review due", counts["review-due"]],
            ["archived", "Disabled", counts.archived],
            ["rejected", "Declined", counts.rejected],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} {count}
          </button>
        ))}
      </div>

      <details className={styles.addPanel}>
        <summary>Add memory</summary>
        <MemoryForm
          key={`create-${createdAt}`}
          action={action}
          expectedRevision={expectedRevision}
          operation="create"
          pending={pending}
          submitLabel="Save memory"
          draft={state.operation === "create" ? state.draft : undefined}
        />
      </details>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {filter === "all"
            ? "Nothing is stored yet. FitTip knows only what you write here."
            : "No memory matches this filter."}
        </p>
      ) : null}

      <MemorySection
        heading="Needs your review"
        note="Proposed memory is never used as coaching context until you accept it."
        entries={proposed}
        expectedRevision={expectedRevision}
        action={action}
        actionState={state}
        pending={pending}
      />
      <MemorySection
        heading="Review due"
        note="The review date has passed. These are excluded from coaching context until you renew, edit or disable them."
        entries={reviewDue}
        expectedRevision={expectedRevision}
        action={action}
        actionState={state}
        pending={pending}
      />
      {TYPE_ORDER.map((memoryType) => (
        <MemorySection
          key={memoryType}
          heading={GROUP_HEADINGS[memoryType]}
          entries={active.filter(
            (entry) => entry.item.memoryType === memoryType,
          )}
          expectedRevision={expectedRevision}
          action={action}
          actionState={state}
          pending={pending}
        />
      ))}
      <MemorySection
        heading="Disabled"
        note="Disabled memory stays inspectable and is excluded from coaching context."
        entries={archived}
        expectedRevision={expectedRevision}
        action={action}
        actionState={state}
        pending={pending}
      />
      <MemorySection
        heading="Declined"
        note="You declined these proposals. They are never used as fact."
        entries={rejected}
        expectedRevision={expectedRevision}
        action={action}
        actionState={state}
        pending={pending}
      />
    </div>
  );
}

function MemorySection({
  heading,
  note,
  entries,
  expectedRevision,
  action,
  actionState,
  pending,
}: {
  heading: string;
  note?: string;
  entries: { item: MemoryView; state: CardState }[];
  expectedRevision: number;
  action: (payload: FormData) => void;
  actionState: MemoryActionState;
  pending: boolean;
}) {
  if (entries.length === 0) return null;
  const headingId = `memory-${heading.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <div className={styles.groupHeading}>
        <h2 id={headingId}>{heading}</h2>
        <p className={styles.groupCount}>{entries.length} filed</p>
      </div>
      {note ? <p className={styles.empty}>{note}</p> : null}
      <ul className={styles.cardList}>
        {entries.map((entry) => (
          <MemoryCard
            key={entry.item.id}
            item={entry.item}
            state={entry.state}
            expectedRevision={expectedRevision}
            action={action}
            actionState={actionState}
            pending={pending}
          />
        ))}
      </ul>
    </section>
  );
}

function MemoryCard({
  item,
  state,
  expectedRevision,
  action,
  actionState,
  pending,
}: {
  item: MemoryView;
  state: CardState;
  expectedRevision: number;
  action: (payload: FormData) => void;
  actionState: MemoryActionState;
  pending: boolean;
}) {
  const editable = state !== "rejected";
  const editOperation = state === "proposed" ? "edit_and_accept" : "edit";
  const draft =
    actionState.itemId === item.id &&
    (actionState.operation === "edit" ||
      actionState.operation === "edit_and_accept")
      ? actionState.draft
      : undefined;

  return (
    <li className={styles.card} data-state={state}>
      <div className={styles.cardBody}>
        <div className={styles.stampRow}>
          <p className={styles.className}>{TYPE_LABELS[item.memoryType]}</p>
          <span className={styles.stamp} data-memory-stamp>
            {STAMPS[state]}
          </span>
        </div>
        <p className={styles.content} data-memory-content>
          {item.content}
        </p>
        <p className={styles.origin}>
          {PROVENANCE_LABELS[item.provenance] ?? "Origin recorded"}
          {item.confidence === null ? "" : ` · confidence ${item.confidence}%`}
          {item.sourceReference === null ? "" : ` · ${item.sourceReference}`}
          {item.userConfirmedAt === null ? "" : " · confirmed by you"}
        </p>
        <p className={styles.revision}>Version {item.revisionNumber}</p>
        {item.expiresOn === null ? null : (
          <p className={styles.reviewDate}>
            {state === "review-due"
              ? `Review was due ${item.expiresOn}.`
              : `Review date ${item.expiresOn}.`}
          </p>
        )}

        <div className={styles.itemActions}>
          {state === "proposed" ? (
            <SimpleAction
              operation="accept"
              label="Accept"
              itemId={item.id}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          ) : null}
          {state === "proposed" ? (
            <ConfirmedAction
              operation="reject"
              label="Decline"
              confirmLabel="Confirm decline"
              consequence="Declining keeps this out of coaching context. It stays visible in your declined list."
              itemId={item.id}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          ) : null}
          {state === "active" || state === "review-due" ? (
            <SimpleAction
              operation="disable"
              label="Disable"
              itemId={item.id}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          ) : null}
          {state === "archived" ? (
            <SimpleAction
              operation="enable"
              label="Enable"
              itemId={item.id}
              expectedRevision={expectedRevision}
              action={action}
              pending={pending}
            />
          ) : null}
          <ConfirmedAction
            operation="delete"
            label="Delete permanently"
            confirmLabel="Confirm permanent delete"
            consequence={DELETE_CONSEQUENCE}
            itemId={item.id}
            expectedRevision={expectedRevision}
            action={action}
            pending={pending}
          />
        </div>

        {editable ? (
          <details className={styles.editor} data-memory-editor>
            <summary>
              {state === "proposed" ? "Edit and accept" : "Edit memory"}
            </summary>
            <MemoryForm
              key={`${editOperation}-${item.id}-${
                draft ? actionState.submission : 0
              }`}
              action={action}
              expectedRevision={expectedRevision}
              operation={editOperation}
              itemId={item.id}
              pending={pending}
              submitLabel={
                state === "proposed" ? "Save and accept" : "Save memory"
              }
              content={item.content}
              reviewDate={item.expiresOn ?? ""}
              draft={draft}
            />
            {state === "active" || state === "review-due" ? (
              <form action={action} className={styles.form}>
                <input type="hidden" name="operation" value="renew" />
                <input type="hidden" name="itemId" value={item.id} />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={expectedRevision}
                />
                <label>
                  New review date
                  <input
                    type="date"
                    name="reviewDate"
                    defaultValue={item.expiresOn ?? ""}
                  />
                </label>
                <button disabled={pending}>Update review date</button>
              </form>
            ) : null}
          </details>
        ) : null}

        <details className={styles.historyPanel}>
          <summary>Version history ({item.history.length})</summary>
          <ul className={styles.historyList}>
            {item.history.map((revision) => (
              <li key={revision.id}>
                <p className={styles.historyMeta}>
                  v{revision.revisionNumber} ·{" "}
                  {CHANGE_LABELS[revision.changeKind] ?? revision.changeKind} ·{" "}
                  {revision.authorClass === "user" ? "by you" : "by FitTip"} ·{" "}
                  {revision.createdAt.slice(0, 10)}
                </p>
                <p className={styles.historyText}>{revision.content}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </li>
  );
}

function MemoryForm({
  action,
  expectedRevision,
  operation,
  itemId,
  pending,
  submitLabel,
  content,
  reviewDate,
  draft,
}: {
  action: (payload: FormData) => void;
  expectedRevision: number;
  operation: "create" | "edit" | "edit_and_accept";
  itemId?: string;
  pending: boolean;
  submitLabel: string;
  content?: string;
  reviewDate?: string;
  draft?: MemoryActionDraft;
}) {
  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
      {operation === "create" ? (
        <label>
          Memory type
          <select
            name="memoryType"
            defaultValue={draft?.memoryType || "profile_fact"}
          >
            <option value="profile_fact">Fact</option>
            <option value="constraint">Constraint</option>
            <option value="preference">Preference</option>
            <option value="observed_pattern">Observed pattern</option>
          </select>
        </label>
      ) : null}
      <label>
        What FitTip should remember
        <textarea
          name="content"
          required
          maxLength={1000}
          defaultValue={draft?.content ?? content ?? ""}
        />
      </label>
      <label>
        Review date (optional)
        <input
          type="date"
          name="reviewDate"
          defaultValue={draft?.reviewDate ?? reviewDate ?? ""}
        />
      </label>
      <p className={styles.safety}>{SAFETY_NOTICE}</p>
      <button disabled={pending}>{submitLabel}</button>
    </form>
  );
}

function SimpleAction({
  operation,
  label,
  itemId,
  expectedRevision,
  action,
  pending,
}: {
  operation: string;
  label: string;
  itemId: string;
  expectedRevision: number;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="expectedRevision" value={expectedRevision} />
      <button disabled={pending}>{label}</button>
    </form>
  );
}

function ConfirmedAction({
  operation,
  label,
  confirmLabel,
  consequence,
  itemId,
  expectedRevision,
  action,
  pending,
}: {
  operation: string;
  label: string;
  confirmLabel: string;
  consequence: string;
  itemId: string;
  expectedRevision: number;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  return (
    <details className={styles.confirmation} data-confirmation={operation}>
      <summary>{label}</summary>
      <p>{consequence}</p>
      <div>
        <SimpleAction
          operation={operation}
          label={confirmLabel}
          itemId={itemId}
          expectedRevision={expectedRevision}
          action={action}
          pending={pending}
        />
        <button
          type="button"
          onClick={(event) => {
            const details = event.currentTarget.closest("details");
            details?.removeAttribute("open");
            details?.querySelector("summary")?.focus();
          }}
        >
          Cancel
        </button>
      </div>
    </details>
  );
}

/**
 * The memory surface submits through `useActionState`, so the typed result and
 * the revalidated server tree arrive inside one App Router transition — the
 * same shape M2-05 documented for goals, and it fails the same way here.
 *
 * Measured on this surface: in a six-run repeat of the 390px flow, one run
 * froze on "Saving memory change…" with stale content and no message, and the
 * continuous-integration run 30728162026 froze at a different mutation. In the
 * CI trace the server answered that mutation in 33 ms with a complete, correct
 * payload — `{"status":"saved"}` plus the new item — and the transition
 * carrying it never committed. So this is not slowness, and waiting longer
 * would not have helped.
 *
 * Watching the mutation from outside React separates two cases: a reply that
 * arrived but never reached the screen, which a reload settles by showing what
 * is actually saved, and a mutation with no reply at all, which is reported as
 * unconfirmed rather than assumed either way. Neither case can tell whether
 * the change succeeded — the action answers 200 for every outcome — so neither
 * claims it did.
 */
type MutationStall = Exclude<TransitionWatch, "waiting">;

function useMutationStall(
  pending: boolean,
  submission: number,
): MutationStall | null {
  // Keyed by the submission it describes, so a later mutation never inherits
  // an earlier one's verdict and no effect has to reset state.
  const [stall, setStall] = useState<{
    key: string;
    verdict: MutationStall;
  } | null>(null);
  const respondedAt = useRef<number | null>(null);
  // The newest response the previous mutation had already accounted for. See
  // `watchTransition`: this is what makes a reply that beats the pending
  // render detectable.
  const consumedAt = useRef<number | null>(null);
  const key = `${submission}:${pending}`;

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const { origin, pathname, search } = window.location;
    const actionUrl = `${origin}${pathname}${search}`;
    const observer = new PerformanceObserver((list) => {
      const seen = latestActionResponseAt(
        list.getEntries() as PerformanceResourceTiming[],
        actionUrl,
      );
      if (seen === null) return;
      if (respondedAt.current === null || seen > respondedAt.current) {
        respondedAt.current = seen;
      }
    });
    observer.observe({ type: "resource", buffered: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pending) return;
    // A new mutation supersedes any earlier recovery, so the explanation is
    // consumed here. Clearing it from the render path instead would consume
    // the marker in the same document that set it, and the reloaded page
    // would have nothing left to explain itself with.
    markRecovered(false);
    const submittedAt = performance.now();
    let reload = 0;
    const interval = window.setInterval(() => {
      const verdict = watchTransition({
        submittedAt,
        respondedAt: respondedAt.current,
        consumedAt: consumedAt.current,
        now: performance.now(),
      });
      if (verdict === "waiting") return;
      window.clearInterval(interval);
      setStall({ key, verdict });
      if (verdict === "lost-render") {
        // A reply came back and never reached the screen. What it said is
        // unknown — every outcome, including a rejection, answers 200 — so
        // reloading is how the surface shows what is actually saved.
        markRecovered(true);
        reload = window.setTimeout(
          () => window.location.reload(),
          RECOVERY_NOTICE_MS,
        );
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      // Cleanup runs on unmount or when this mutation settles, so a queued
      // reload is always stale by then: the user has navigated away, or the
      // lost transition landed inside the notice window and the result is
      // already on screen.
      window.clearTimeout(reload);
      consumedAt.current = respondedAt.current;
    };
  }, [key, pending]);

  return stall?.key === key ? stall.verdict : null;
}

/**
 * The recovery reload replaces the whole surface, so the result message the
 * mutation produced is gone. Saying nothing would leave the reload looking
 * like an unexplained flash, so the reason is carried across it and reported
 * until the next mutation.
 */
function useRecoveredReload(submission: number): boolean {
  // The server has no session storage, so it reports "not recovered" and the
  // client agrees on the first render; hydration cannot mismatch. The marker
  // is consumed by the next mutation, not here.
  const recovered = useSyncExternalStore(
    subscribeNothing,
    readRecovered,
    () => false,
  );
  return recovered && submission === 0;
}

function subscribeNothing() {
  return () => {};
}

function readRecovered(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch {
    // Session storage throws in private browsing and when it is disabled.
    return false;
  }
}

function markRecovered(recovered: boolean) {
  try {
    if (recovered) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Losing the marker only costs the explanation, never the recovery.
  }
}

function stallNotice(stall: TransitionWatch | null) {
  if (stall === "lost-render") {
    // Says only what is known. A reply arrived and never rendered; whether it
    // saved, was rejected, or failed validation is not observable here, so the
    // reload is what settles it.
    return "This memory change did not appear. Reloading to show what is saved.";
  }
  if (stall === "unconfirmed") {
    return "This memory change has not been confirmed. Reload to see whether it was saved.";
  }
  return null;
}

function cardState(item: MemoryView, today: string): CardState {
  if (item.status === "proposed") return "proposed";
  if (item.status === "rejected") return "rejected";
  if (item.status === "archived") return "archived";
  return item.expiresOn !== null && item.expiresOn < today
    ? "review-due"
    : "active";
}

function countByState(entries: { item: MemoryView; state: CardState }[]) {
  const counts: Record<CardState, number> = {
    active: 0,
    proposed: 0,
    "review-due": 0,
    archived: 0,
    rejected: 0,
  };
  for (const entry of entries) counts[entry.state] += 1;
  return counts;
}
