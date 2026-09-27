import type { LibraryActivityOption } from "./activity-editor";

import { activityNameKey } from "@/lib/training/activity-name";
import { matchesDefinition } from "@/lib/training/activity-value";
import { ACTIVITY_COPY } from "@/lib/training/measurement-copy";

type Definition = Omit<LibraryActivityOption, "id" | "updatedAt">;

/** What a row may do with the library, and what each button says. */
export type LibraryOffer = {
  /** Save the row as a new definition. */
  saveLabel?: string;
  /** Why a row that is not in the library cannot be saved into it. */
  saveBlocked?: string;
  /** Overwrite the definition the row came from. */
  update?: { label: string; linked: LibraryActivityOption };
};

/**
 * One rule for every session editor, the Plan's and the log's alike.
 *
 * A row the library already holds as it is offers nothing. One typed by hand,
 * or whose definition was removed, may be saved as a new definition. One
 * picked from the library and then changed may do either (owner, 27 Sep
 * 2026): update the definition it came from, or be saved beside it as a new
 * one — a similar exercise is still a new definition when the owner says so.
 *
 * Names are unique in the library, so a save or an update that would repeat
 * another definition's name is told to rename rather than offered. A row
 * that kept its definition's own name can still update it; saving it as a
 * second one of that name is not offered, and the hint says to rename it.
 */
export function libraryOffer(
  personalActivityId: string | null,
  definition: Definition,
  known: ReadonlyMap<string, LibraryActivityOption>,
): LibraryOffer {
  const linked =
    personalActivityId === null ? undefined : known.get(personalActivityId);
  if (matchesDefinition(linked, definition)) return {};

  const key = activityNameKey(definition.name);
  const holders = [...known.values()].filter(
    (option) => activityNameKey(option.name) === key,
  );
  const takenByOther = holders.some((option) => option.id !== linked?.id);

  if (linked === undefined) {
    return holders.length > 0
      ? { saveBlocked: ACTIVITY_COPY.nameTaken(definition.name) }
      : { saveLabel: ACTIVITY_COPY.saveToLibrary };
  }
  return {
    ...(holders.length > 0
      ? { saveBlocked: ACTIVITY_COPY.nameTaken(definition.name) }
      : { saveLabel: ACTIVITY_COPY.saveAsNewToLibrary }),
    // Renamed to another definition's name: neither can take it, and the
    // save hint above already says to rename, so it is not said twice.
    ...(takenByOther
      ? {}
      : {
          update: {
            label: ACTIVITY_COPY.updateInLibrary(linked.name),
            linked,
          },
        }),
  };
}
