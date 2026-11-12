"use client";

import { startTransition, useRef, useState } from "react";

import { INITIAL_PROFILE_ACTION_STATE } from "@/app/home/you/profile-action-state";
import { saveTrainingSetupAction } from "@/app/home/you/profile-actions";
import { PushSlider } from "@/components/profile/push-slider";
import {
  Saved,
  useDebouncedSend,
  type PartState,
} from "@/components/profile/training-settings";
import type { CoachPushLevel } from "@/lib/training/training-setup";
import styles from "./training-settings.module.css";

/**
 * How hard the coach pushes, on its own Settings row (owner, 12 Nov 2026).
 * It saves itself as the slider settles, with no Save button, as the training
 * setup does and with its helpers: a run of moves is one save, of where the
 * thumb stopped, and one still waiting is sent when the page is left.
 */
export function CoachingSettings({ initial }: { initial: CoachPushLevel }) {
  const [state, setState] = useState<PartState>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef(0);

  const send = useDebouncedSend(500, (level: CoachPushLevel) => {
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
  });

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
          <Saved state={state} />
        </div>
        <PushSlider initial={initial} onChange={(level) => send(level)} />
        <p className={styles.hint}>
          Your coach uses this for roadmaps, weekly plans and the exercises in a
          session. A note you write when asking always comes first, and so does
          anything you report about pain, illness, injury or fatigue.
        </p>
      </section>
    </div>
  );
}
