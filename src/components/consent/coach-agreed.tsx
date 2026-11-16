"use client";

import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";

import styles from "./coach-consent.module.css";

/**
 * Whether the coach may be asked (ADR-043 decision 5), read once by the /home
 * layout. Only what a button shows: every coach action checks the decision
 * for itself, and the database checks it again. Outside the provider (a test
 * rendering one component) it reads as agreed, which changes nothing.
 */
const CoachAgreed = createContext(true);

export function CoachAgreedProvider({
  agreed,
  children,
}: {
  agreed: boolean;
  children: ReactNode;
}) {
  return <CoachAgreed.Provider value={agreed}>{children}</CoachAgreed.Provider>;
}

export function useCoachAgreed(): boolean {
  return useContext(CoachAgreed);
}

/**
 * Under a coach button that is off (owner, 15 Nov 2026): why it is grey, and
 * the way to the setting that turns it on.
 */
export function CoachOffNotice() {
  return (
    <p className={styles.off} data-coach-off>
      The coach is off until you agree.{" "}
      <Link href="/home/you/settings/coach-data">Turn it on in Settings ›</Link>
    </p>
  );
}
