"use client";

import { useState } from "react";

import type { SaveToLibraryResult } from "./activity-editor";

import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";

/** What `libraryOffer` and an editor's callbacks give one row. */
export type LibraryRowActionProps = {
  saveLabel?: string;
  onSave?: () => Promise<SaveToLibraryResult>;
  saveBlocked?: string;
  updateLabel?: string;
  onUpdate?: () => Promise<SaveToLibraryResult>;
};

/**
 * The library buttons at the foot of an activity row, the Plan's and the
 * log's alike: save as a new definition, update the one the row came from,
 * or the reason neither can happen. Which of them appear is decided by
 * `libraryOffer`; this only runs them and says what came back.
 *
 * The answer is held here rather than derived, because a save or an update
 * makes the row match the library again, which takes the buttons away — and
 * the answer has to outlive the button that asked.
 */
export function LibraryRowActions({
  saveLabel,
  onSave,
  saveBlocked,
  updateLabel,
  onUpdate,
  buttonClassName,
  hintClassName,
}: LibraryRowActionProps & {
  buttonClassName: string;
  hintClassName: string;
}) {
  const [busy, setBusy] = useState<"save" | "update" | null>(null);
  const [notice, setNotice] = useState<SaveToLibraryResult | null>(null);

  async function run(
    which: "save" | "update",
    action: () => Promise<SaveToLibraryResult>,
  ) {
    setBusy(which);
    try {
      setNotice(await action());
    } catch {
      setNotice({
        status: "refused",
        message: ACTIVITY_COPY.saveToLibraryFailed,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {onUpdate === undefined || updateLabel === undefined ? null : (
        <button
          className={buttonClassName}
          type="button"
          disabled={busy !== null}
          onClick={() => run("update", onUpdate)}
        >
          {busy === "update" ? ACTIVITY_COPY.updatingInLibrary : updateLabel}
        </button>
      )}
      {onSave === undefined || saveLabel === undefined ? null : (
        <button
          className={buttonClassName}
          type="button"
          disabled={busy !== null}
          onClick={() => run("save", onSave)}
        >
          {busy === "save" ? ACTIVITY_COPY.savingToLibrary : saveLabel}
        </button>
      )}
      {saveBlocked === undefined ? null : (
        <p className={hintClassName}>{saveBlocked}</p>
      )}
      {notice === null ? null : (
        <p className={hintClassName} role="status">
          {notice.message}
        </p>
      )}
    </>
  );
}
