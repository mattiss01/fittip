"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { keepsAsSport } from "@/lib/sports/sport-presets";

type OwnedSportsValue = {
  sports: readonly string[];
  remember: (names: readonly string[]) => void;
};

const OwnedSports = createContext<OwnedSportsValue>({
  sports: [],
  remember: () => {},
});

/**
 * The owner's sports, for every field under Home where a sport is typed
 * (owner, 5 and 8 Oct 2026). Read once by the layout and handed down here, so
 * a form several components deep does not have to be passed the list.
 *
 * A sport typed into a form that is sent joins the owner's sports on the
 * server, and is offered here from then on in this page too, rather than only
 * once the layout is read again. Should the save be refused, it is offered
 * until the next load, which costs no more than a suggestion.
 */
export function OwnedSportsProvider({
  sports,
  children,
}: {
  sports: readonly string[];
  children: ReactNode;
}) {
  const [sent, setSent] = useState<readonly string[]>([]);
  const remember = useCallback((names: readonly string[]) => {
    setSent((current) => withNew(current, names.filter(keepsAsSport)));
  }, []);
  const value = useMemo(
    () => ({ sports: withNew(sports, sent), remember }),
    [sports, sent, remember],
  );
  return <OwnedSports value={value}>{children}</OwnedSports>;
}

/** Empty outside Home, where a sport field is then a plain field. */
export function useOwnedSports(): readonly string[] {
  return useContext(OwnedSports).sports;
}

/** Tells the list about sports a form is sending. */
export function useRememberSports(): (names: readonly string[]) => void {
  return useContext(OwnedSports).remember;
}

function withNew(
  list: readonly string[],
  names: readonly string[],
): readonly string[] {
  const known = new Set(list.map((sport) => sport.toLocaleLowerCase()));
  const added = names.filter((name) => {
    const key = name.toLocaleLowerCase();
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return added.length === 0 ? list : [...list, ...added];
}
