"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import w from "./plan-week.module.css";

/**
 * The Plan's bottom sheet, without its contents: a day's "+" and the month
 * calendar both open one.
 *
 * Modal while open: everything else on the page is inert, so Tab stays in the
 * sheet, and the page behind does not scroll. Escape and the scrim close it;
 * focus goes back to whatever opened it. Portalled to the body so it sits
 * above the bottom navigation, whatever stacking context the page's main
 * element makes.
 */
export function SheetLayer({
  view,
  labelledBy,
  onClose,
  children,
}: {
  /** Which sheet this is, for tests and styles (`data-plan-sheet`). */
  view: string;
  /** The id of the heading inside that names the dialog. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Read while rendering, before anything inside takes focus.
  const [opener] = useState(() => document.activeElement);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const layerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = layerRef.current;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== layer && !element.inert,
    );
    for (const element of background) element.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const element of background) element.inert = false;
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return createPortal(
    <div className={w.sheetLayer} ref={layerRef}>
      <button
        type="button"
        className={w.scrim}
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className={w.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-plan-sheet={view}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
