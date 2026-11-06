"use client";

import {
  startTransition,
  useId,
  useOptimistic,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  addSportAction,
  deleteSportAction,
  renameSportAction,
  setSportColourAction,
  type SportActionResult,
} from "@/app/home/you/sport-actions";
import {
  SPORT_SWATCHES,
  sportKey,
  SWATCH_NAMES,
  swatchColour,
  type OwnedSport,
  type SportSwatch,
} from "@/lib/sports/sport-colours";
import {
  keepsAsSport,
  SPORT_NAME_MAX_LENGTH,
  tidySportName,
} from "@/lib/sports/sport-presets";
import styles from "./sport-list.module.css";

type Open =
  | { kind: "colour"; id: string }
  | { kind: "rename"; id: string; draft: string; mergeInto: string | null }
  | { kind: "remove"; id: string }
  | null;

type Change =
  | { kind: "colour"; id: string; colour: SportSwatch }
  | { kind: "rename"; id: string; name: string }
  | { kind: "remove"; id: string };

/**
 * "Your sports" in Settings (owner, 6 Nov 2026): the owner's own sports and
 * nothing else, each with the colour it wears on Plan and Progress. A dot
 * opens the twelve swatches, the name renames it everywhere, and × takes it
 * off the list after asking. A field at the end adds one by name.
 *
 * A change shows at once and is sent straight away; the page then reads the
 * list again. One the server refuses falls back to what is saved, with why.
 * Closing a panel puts focus back on the row's dot, or on the field when the
 * row is gone, so a keyboard is never left on nothing.
 */
export function SportList({ sports }: { sports: OwnedSport[] }) {
  const [shown, apply] = useOptimistic(sports, applyChange);
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const addId = useId();

  const close = (id: string) => {
    setOpen(null);
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>(`[data-sport-dot="${id}"]`) ??
        document.getElementById(addId)
      )?.focus(),
    );
  };

  const send = (change: Change, call: () => Promise<SportActionResult>) => {
    setNotice(null);
    close(change.id);
    startTransition(async () => {
      apply(change);
      const result = await call();
      if (result.status !== "saved") setNotice(result.message);
    });
  };

  const nameTaken = (name: string, except: string | null) =>
    shown.find(
      (sport) => sport.id !== except && sportKey(sport.name) === sportKey(name),
    ) ?? null;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const name = tidySportName(typed);
    if (name === "") return;
    if (!keepsAsSport(name)) {
      setNotice(NAME_RULE);
      return;
    }
    const taken = nameTaken(name, null);
    if (taken) {
      setNotice(`You already have ${taken.name}.`);
      return;
    }
    setNotice(null);
    setTyped("");
    startTransition(async () => {
      const result = await addSportAction(name);
      if (result.status !== "saved") {
        setNotice(result.message);
        setTyped(name);
      }
    });
  };

  const rename = (sport: OwnedSport, draft: string, merge: boolean) => {
    const name = tidySportName(draft);
    if (name === sport.name || name === "") {
      close(sport.id);
      return;
    }
    if (!keepsAsSport(name)) {
      setNotice(NAME_RULE);
      return;
    }
    const taken = nameTaken(name, sport.id);
    if (taken && !merge) {
      setOpen({ kind: "rename", id: sport.id, draft, mergeInto: taken.name });
      return;
    }
    send(
      taken
        ? { kind: "remove", id: sport.id }
        : { kind: "rename", id: sport.id, name },
      // The server merges only when told to, so a sport added elsewhere
      // since this list was read is refused rather than merged unasked.
      () => renameSportAction(sport.id, name, taken !== null),
    );
  };

  return (
    <div className={styles.list}>
      <p className={styles.explainer}>
        Each sport has one colour on your Plan and Progress. Renaming a sport
        renames it on every session, log and goal.
      </p>
      {notice === null ? null : (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}
      {shown.length === 0 ? (
        <p className={styles.empty}>
          No sports yet. Add one below, or type one into a session.
        </p>
      ) : (
        <ul className={styles.rows} aria-label="Your sports">
          {shown.map((sport) => {
            const here = open?.id === sport.id ? open : null;
            return (
              <li
                className={styles.row}
                key={sport.id}
                style={{ "--dot": swatchColour(sport.colour) } as CSSProperties}
              >
                <div className={styles.line}>
                  <button
                    aria-expanded={here?.kind === "colour"}
                    aria-label={`Colour of ${sport.name}: ${SWATCH_NAMES[sport.colour]}`}
                    className={styles.dot}
                    data-sport-dot={sport.id}
                    onClick={() =>
                      setOpen(
                        here?.kind === "colour"
                          ? null
                          : { kind: "colour", id: sport.id },
                      )
                    }
                    type="button"
                  >
                    <span aria-hidden="true" />
                  </button>
                  {here?.kind === "rename" ? (
                    <form
                      className={styles.renameForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        rename(sport, here.draft, false);
                      }}
                    >
                      <input
                        aria-label={`New name for ${sport.name}`}
                        autoFocus
                        maxLength={SPORT_NAME_MAX_LENGTH}
                        onChange={(event) =>
                          setOpen({
                            ...here,
                            draft: event.target.value,
                            mergeInto: null,
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") close(sport.id);
                        }}
                        value={here.draft}
                      />
                      <button className={styles.save} type="submit">
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      aria-label={`Rename ${sport.name}`}
                      className={styles.name}
                      onClick={() =>
                        setOpen({
                          kind: "rename",
                          id: sport.id,
                          draft: sport.name,
                          mergeInto: null,
                        })
                      }
                      type="button"
                    >
                      {sport.name}
                    </button>
                  )}
                  {here?.kind === "rename" ? (
                    <button
                      className={styles.quiet}
                      onClick={() => close(sport.id)}
                      type="button"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      aria-label={`Remove ${sport.name}`}
                      className={styles.remove}
                      onClick={() => setOpen({ kind: "remove", id: sport.id })}
                      type="button"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>

                {here?.kind === "colour" ? (
                  <div
                    aria-label={`Colour of ${sport.name}`}
                    className={styles.swatches}
                    role="group"
                  >
                    {SPORT_SWATCHES.map((swatch) => (
                      <button
                        aria-pressed={swatch === sport.colour}
                        aria-label={SWATCH_NAMES[swatch]}
                        className={styles.swatch}
                        key={swatch}
                        onClick={() =>
                          swatch === sport.colour
                            ? close(sport.id)
                            : send(
                                {
                                  kind: "colour",
                                  id: sport.id,
                                  colour: swatch,
                                },
                                () => setSportColourAction(sport.id, swatch),
                              )
                        }
                        title={SWATCH_NAMES[swatch]}
                        style={
                          { "--swatch": swatchColour(swatch) } as CSSProperties
                        }
                        type="button"
                      />
                    ))}
                  </div>
                ) : null}

                {here?.kind === "rename" && here.mergeInto !== null ? (
                  <div className={styles.ask}>
                    <p>
                      You already have {here.mergeInto}. Merging makes every{" "}
                      {sport.name} session, log and goal {here.mergeInto}, in{" "}
                      {here.mergeInto}&rsquo;s colour.
                    </p>
                    <div className={styles.askActions}>
                      <button
                        className={styles.quiet}
                        onClick={() => close(sport.id)}
                        type="button"
                      >
                        Keep both
                      </button>
                      <button
                        className={styles.confirm}
                        onClick={() => rename(sport, here.draft, true)}
                        type="button"
                      >
                        Merge
                      </button>
                    </div>
                  </div>
                ) : null}

                {here?.kind === "remove" ? (
                  <div className={styles.ask}>
                    <p>
                      Remove {sport.name} from your sports? Its sessions and
                      logs keep it, shown in grey.
                    </p>
                    <div className={styles.askActions}>
                      <button
                        className={styles.quiet}
                        onClick={() => close(sport.id)}
                        type="button"
                      >
                        Keep
                      </button>
                      <button
                        className={styles.danger}
                        onClick={() =>
                          send({ kind: "remove", id: sport.id }, () =>
                            deleteSportAction(sport.id),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <form className={styles.add} onSubmit={add}>
        <label htmlFor={addId}>Add a sport</label>
        <div className={styles.addLine}>
          <input
            id={addId}
            maxLength={SPORT_NAME_MAX_LENGTH}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="e.g. Climbing"
            value={typed}
          />
          <button className={styles.save} type="submit">
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

const NAME_RULE = "A sport is a name of up to 60 characters, without a comma.";

function applyChange(sports: OwnedSport[], change: Change): OwnedSport[] {
  if (change.kind === "remove") {
    return sports.filter((sport) => sport.id !== change.id);
  }
  return sports.map((sport) =>
    sport.id !== change.id
      ? sport
      : change.kind === "colour"
        ? { ...sport, colour: change.colour }
        : { ...sport, name: change.name },
  );
}
