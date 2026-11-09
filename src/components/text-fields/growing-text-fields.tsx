"use client";

import { useEffect } from "react";

/**
 * Every text box grows with its text (owner, 9 Nov 2026). `field-sizing:
 * content` in globals.css does it where the browser has it; this does it where
 * it does not, by setting each box's height to its content's as it is shown
 * and as it is typed in. Mounted once, in the root layout.
 */
export function GrowingTextFields() {
  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) {
      return;
    }

    const fit = (field: HTMLTextAreaElement) => {
      field.style.height = "auto";
      const borders = field.offsetHeight - field.clientHeight;
      field.style.height = `${field.scrollHeight + borders}px`;
    };
    const fitAll = () => document.querySelectorAll("textarea").forEach(fit);
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLTextAreaElement) fit(event.target);
    };

    fitAll();
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusin", onInput, true);
    // A form drawn after a navigation, or opened later, holds new boxes.
    const observer = new MutationObserver(fitAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusin", onInput, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
