"use client";

import { createContext, useContext, type ReactNode } from "react";

const OwnedSports = createContext<readonly string[]>([]);

/**
 * The owner's sports, for every field under Home where a sport is typed
 * (owner, 5 and 8 Oct 2026). Read once by the layout and handed down here, so
 * a form several components deep does not have to be passed the list.
 */
export function OwnedSportsProvider({
  sports,
  children,
}: {
  sports: readonly string[];
  children: ReactNode;
}) {
  return <OwnedSports.Provider value={sports}>{children}</OwnedSports.Provider>;
}

/** Empty outside Home, where a sport field is then a plain field. */
export function useOwnedSports(): readonly string[] {
  return useContext(OwnedSports);
}
