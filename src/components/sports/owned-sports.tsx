"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { colourOfSport, type OwnedSport } from "@/lib/sports/sport-colours";
import { keepsAsSport } from "@/lib/sports/sport-presets";

type OwnedSportsValue = {
  sports: readonly string[];
  colourOf: (sport: string | null) => string;
  remember: (names: readonly string[]) => void;
};

const OwnedSports = createContext<OwnedSportsValue>({
  sports: [],
  colourOf: (sport) => colourOfSport([], sport),
  remember: () => {},
});

/**
 * The owner's sports, for every field under Home where a sport is typed
 * (owner, 5 and 8 Oct 2026), and the colour each is drawn in (owner, 6 Nov
 * 2026). Read once by the layout and handed down here, so a form or a card
 * several components deep does not have to be passed the list.
 *
 * A sport typed into a form that is sent joins the owner's sports on the
 * server, and is offered here from then on in this page too, rather than only
 * once the layout is read again. Should the save be refused, it is offered
 * until the next load, which costs no more than a suggestion. Its colour comes
 * with the next read, since the database chooses it.
 */
export function OwnedSportsProvider({
  sports,
  children,
}: {
  sports: readonly OwnedSport[];
  children: ReactNode;
}) {
  const [sent, setSent] = useState<readonly string[]>([]);
  const remember = useCallback((names: readonly string[]) => {
    setSent((current) => withNew(current, names.filter(keepsAsSport)));
  }, []);
  const value = useMemo(
    () => ({
      sports: withNew(
        sports.map((sport) => sport.name),
        sent,
      ),
      colourOf: (sport: string | null) => colourOfSport(sports, sport),
      remember,
    }),
    [sports, sent, remember],
  );
  return <OwnedSports value={value}>{children}</OwnedSports>;
}

/** Empty outside Home, where a sport field is then a plain field. */
export function useOwnedSports(): readonly string[] {
  return useContext(OwnedSports).sports;
}

/** The colour a sport is drawn in; the muted ink for one not on the list. */
export function useSportColour(): (sport: string | null) => string {
  return useContext(OwnedSports).colourOf;
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
