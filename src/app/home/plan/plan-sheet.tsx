"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import w from "./plan-week.module.css";

/** How long a sheet takes to leave; the CSS's sheet-out runs the same. */
const CLOSE_MS = 180;

/**
 * Closes the sheet it is inside the way the scrim and Escape do: it slides
 * away first (R4, owner, 3 Oct 2026), then the owner of the sheet is told.
 */
const SheetCloseContext = createContext<() => void>(() => {});

export function useCloseSheet() {
  return useContext(SheetCloseContext);
}

/**
 * A button that ends the sheet it is in, leaving as the sheet does: its own
 * Close, or a choice like a day in the month calendar, whose action runs
 * first.
 */
export function SheetCloseButton({
  onBeforeClose,
  children,
  ...button
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  onBeforeClose?: () => void;
  children: ReactNode;
}) {
  const close = useCloseSheet();
  return (
    <button
      {...button}
      type="button"
      onClick={() => {
        onBeforeClose?.();
        close();
      }}
    >
      {children}
    </button>
  );
}

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
  placement = "bottom",
  labelledBy,
  onClose,
  children,
}: {
  /** Which sheet this is, for tests and styles (`data-plan-sheet`). */
  view: string;
  /**
   * A sheet rises from the bottom. A short question with two answers stands
   * in the middle of the screen instead (owner, 2 Oct 2026).
   */
  placement?: "bottom" | "center";
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
  // Leaving: the sheet slides down, then its owner is told. Without motion,
  // or if the animation never reports its end, it is told at once or soon.
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      close.current();
      return;
    }
    setClosing(true);
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => close.current(), CLOSE_MS + 60);
    return () => window.clearTimeout(timer);
  }, [closing]);
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
      if (event.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const element of background) element.inert = false;
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener, requestClose]);

  return createPortal(
    <div
      className={w.sheetLayer}
      ref={layerRef}
      data-placement={placement}
      data-closing={closing || undefined}
    >
      <button
        type="button"
        className={w.scrim}
        aria-label="Close"
        tabIndex={-1}
        onClick={requestClose}
      />
      <div
        className={w.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-plan-sheet={view}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) {
            close.current();
          }
        }}
      >
        <SheetCloseContext.Provider value={requestClose}>
          {children}
        </SheetCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
