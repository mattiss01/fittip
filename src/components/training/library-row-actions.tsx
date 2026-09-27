"use client";

import { useState } from "react";

import type {
  LibraryActivityOption,
  SaveToLibrary,
  SaveToLibraryResult,
  UpdateInLibrary,
} from "./activity-editor";
import { libraryOffer } from "./library-offer";

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

type Definition = Omit<LibraryActivityOption, "id" | "updatedAt">;

/**
 * The library half of a session editor, shared by the Plan's and the log's.
 *
 * `known` is the library as the page read it plus every definition this
 * editor saved or updated since, until the page's refresh brings them in:
 * without them a row saved a moment ago would read as linked to nothing, or
 * as differing from what it just wrote, and offer the same button again.
 *
 * `actionsFor` gives one row its buttons by the `libraryOffer` rule; a save
 * or an update that lands calls `onLinked` with the definition the row now
 * answers to.
 */
export function useLibraryRowActions({
  library,
  saveToLibrary,
  updateInLibrary,
}: {
  library: readonly LibraryActivityOption[];
  saveToLibrary?: SaveToLibrary;
  updateInLibrary?: UpdateInLibrary;
}) {
  const [savedHere, setSavedHere] = useState<LibraryActivityOption[]>([]);
  const known = new Map(
    [...library, ...savedHere].map((option) => [option.id, option]),
  );

  function actionsFor(
    personalActivityId: string | null,
    definition: Definition,
    onLinked: (personalActivityId: string) => void,
  ): LibraryRowActionProps {
    const offer = libraryOffer(personalActivityId, definition, known);
    const remember = (result: SaveToLibraryResult) => {
      if (result.status === "saved") {
        setSavedHere((current) => [
          ...current,
          {
            id: result.personalActivityId,
            updatedAt: result.updatedAt,
            ...definition,
          },
        ]);
        onLinked(result.personalActivityId);
      }
      return result;
    };
    const offered = offer.update;
    return {
      ...(saveToLibrary === undefined
        ? {}
        : {
            saveLabel: offer.saveLabel,
            saveBlocked: offer.saveBlocked,
            ...(offer.saveLabel === undefined
              ? {}
              : {
                  onSave: async () => remember(await saveToLibrary(definition)),
                }),
          }),
      ...(updateInLibrary === undefined || offered === undefined
        ? {}
        : {
            updateLabel: offered.label,
            onUpdate: async () =>
              remember(
                await updateInLibrary(
                  offered.linked.id,
                  offered.linked.updatedAt,
                  definition,
                ),
              ),
          }),
    };
  }

  return { known, actionsFor };
}
