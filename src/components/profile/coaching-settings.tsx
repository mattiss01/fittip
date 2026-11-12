"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { INITIAL_PROFILE_ACTION_STATE } from "@/app/home/you/profile-action-state";
import { saveTrainingSetupAction } from "@/app/home/you/profile-actions";
import { PushSlider } from "@/components/profile/push-slider";
import type { CoachPushLevel } from "@/lib/training/training-setup";
import styles from "./training-settings.module.css";

type SaveState = "saving" | "saved" | "refused" | undefined;

/**
 * How hard the coach pushes, on its own Settings row (owner, 12 Nov 2026).
 * It saves itself as the slider settles, with no Save button, as the training
 * setup does: a run of moves is one save, of where the thumb stopped, and one
 * still waiting is sent when the page is left.
 */
export function CoachingSettings({ initial }: { initial: CoachPushLevel }) {
  const [state, setState] = useState<SaveState>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const waiting = useRef<CoachPushLevel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  // Stable: it reads only refs and state setters, so the page-leave listener
  // below is added once and always sends the latest waiting level.
  const send = useCallback((level: CoachPushLevel) => {
    const form = new FormData();
    form.set("part", "push");
    form.set("pushLevel", level);
    const ticket = ++latest.current;
    setState("saving");
    startTransition(async () => {
      const result = await saveTrainingSetupAction(
        INITIAL_PROFILE_ACTION_STATE,
        form,
      ).catch(() => null);
      // A newer save has the last word.
      if (latest.current !== ticket) return;
      const saved = result?.status === "saved";
      setState(saved ? "saved" : "refused");
      setMessage(
        saved
          ? null
          : (result?.message ??
              "Your coaching style could not be saved. Reload and try again."),
      );
    });
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const level = waiting.current;
    waiting.current = null;
    if (level !== null) send(level);
  }, [send]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return (
    <div className={styles.parts}>
      {message === null ? null : (
        <p className={styles.notice} role="alert">
          {message}
        </p>
      )}
      <section
        aria-label="How hard your coach pushes you"
        className={styles.part}
      >
        <div className={styles.partHead}>
          <h2>How hard should your coach push you?</h2>
          <span
            className={styles.saved}
            data-refused={state === "refused" || undefined}
            role="status"
          >
            {state === "saving"
              ? "Saving…"
              : state === "saved"
                ? "Saved"
                : state === "refused"
                  ? "Not saved"
                  : ""}
          </span>
        </div>
        <PushSlider
          initial={initial}
          onChange={(level) => {
            waiting.current = level;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, 500);
          }}
        />
        <p className={styles.hint}>
          Your coach uses this for roadmaps, weekly plans and the exercises in a
          session. A note you write when asking always comes first, and so does
          anything you log about pain, illness or fatigue.
        </p>
      </section>
    </div>
  );
}
